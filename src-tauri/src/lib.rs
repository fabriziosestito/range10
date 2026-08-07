use std::io;
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_blec::models::WriteType;
use tauri_plugin_blec::{get_handler, Handler, OnDisconnectHandler};
use tauri_plugin_tts::{QueueMode, SpeakRequest, TtsExt};
use tenover::proto::{BallData, ClubData, SwingData};
use tenover::{Client, Event, ShotData, Transport};
use uuid::{uuid, Uuid};

const MULTILINK_SERVICE: Uuid = uuid!("6a4e2800-667b-11e3-949a-0800200c9a66");
const REGISTER_CHARACTERISTIC: Uuid = uuid!("6a4e2810-667b-11e3-949a-0800200c9a66");
const DATA_CHARACTERISTIC: Uuid = uuid!("6a4e2820-667b-11e3-949a-0800200c9a66");

#[derive(Default)]
struct SessionState {
    stop: Mutex<Option<Sender<()>>>,
    generation: Mutex<u64>,
    lifecycle: tokio::sync::Mutex<()>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionEvent {
    attempt_id: u64,
    stage: &'static str,
    message: String,
}

fn emit_connection(
    app: &AppHandle,
    attempt_id: u64,
    stage: &'static str,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "r10://connection",
        ConnectionEvent {
            attempt_id,
            stage,
            message: message.into(),
        },
    );
}

fn schedule_late_disconnect(app: AppHandle, attempt_id: u64, handler: &'static Handler) {
    tauri::async_runtime::spawn(async move {
        for _ in 0..20 {
            let state = app.state::<SessionState>();
            let _lifecycle = state.lifecycle.lock().await;
            let current_generation = app
                .state::<SessionState>()
                .generation
                .lock()
                .map(|generation| *generation)
                .unwrap_or(u64::MAX);
            if current_generation != attempt_id {
                return;
            }
            if handler.is_connected() {
                cleanup_ble(handler).await;
                return;
            }
            drop(_lifecycle);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
}

async fn cleanup_ble(handler: &'static Handler) {
    let _ = tokio::time::timeout(
        Duration::from_secs(5),
        handler.unsubscribe(REGISTER_CHARACTERISTIC),
    )
    .await;
    if handler.is_connected() {
        let _ = tokio::time::timeout(Duration::from_secs(8), handler.disconnect()).await;
    }
}

async fn cleanup_owned_attempt(app: &AppHandle, attempt_id: u64, handler: &'static Handler) {
    let state = app.state::<SessionState>();
    let _lifecycle = state.lifecycle.lock().await;
    let owns_attempt = state
        .generation
        .lock()
        .map(|generation| *generation == attempt_id)
        .unwrap_or(false);
    if owns_attempt {
        cleanup_ble(handler).await;
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoiceConfig {
    #[serde(default = "default_voice_enabled")]
    voice_enabled: bool,
    #[serde(default = "default_units")]
    units: String,
    #[serde(default)]
    metrics: EnabledMetrics,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            voice_enabled: default_voice_enabled(),
            units: default_units(),
            metrics: EnabledMetrics::default(),
        }
    }
}

fn default_voice_enabled() -> bool {
    true
}

fn default_units() -> String {
    "imperial".into()
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct EnabledMetrics {
    club_speed: bool,
    path: bool,
    face: bool,
    attack: bool,
    tempo: bool,
    launch: bool,
    ball_speed: bool,
    spin: bool,
}

impl Default for EnabledMetrics {
    fn default() -> Self {
        Self {
            club_speed: true,
            path: true,
            face: false,
            attack: true,
            tempo: true,
            launch: false,
            ball_speed: false,
            spin: false,
        }
    }
}

#[derive(Default)]
struct VoiceState {
    config: Mutex<VoiceConfig>,
}

#[tauri::command]
fn set_voice_config(state: State<'_, VoiceState>, config: VoiceConfig) -> Result<(), String> {
    *state
        .config
        .lock()
        .map_err(|_| "voice config lock poisoned".to_string())? = config;
    Ok(())
}

struct BlecTransport {
    notifications: Receiver<Vec<u8>>,
    handler: &'static Handler,
}

impl Transport for BlecTransport {
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, io::Error> {
        match self.notifications.try_recv() {
            Ok(data) => {
                let length = data.len().min(buf.len());
                buf[..length].copy_from_slice(&data[..length]);
                Ok(length)
            }
            Err(TryRecvError::Empty) => Err(io::Error::from(io::ErrorKind::WouldBlock)),
            Err(TryRecvError::Disconnected) => Err(io::Error::from(io::ErrorKind::BrokenPipe)),
        }
    }

    fn write(&mut self, data: &[u8]) -> Result<(), io::Error> {
        tauri::async_runtime::block_on(tokio::time::timeout(
            Duration::from_secs(5),
            self.handler.send_data(
                DATA_CHARACTERISTIC,
                Some(MULTILINK_SERVICE),
                data,
                WriteType::WithoutResponse,
            ),
        ))
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "R10 data write timed out"))?
        .map_err(|error| io::Error::other(error.to_string()))
    }

    fn write_register(&mut self, data: &[u8]) -> Result<(), io::Error> {
        tauri::async_runtime::block_on(tokio::time::timeout(
            Duration::from_secs(5),
            self.handler.send_data(
                REGISTER_CHARACTERISTIC,
                Some(MULTILINK_SERVICE),
                data,
                WriteType::WithResponse,
            ),
        ))
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "R10 register write timed out"))?
        .map_err(|error| io::Error::other(error.to_string()))
    }
}

fn speak(app: &AppHandle, text: String) {
    if let Err(error) = app.tts().speak(SpeakRequest {
        text,
        language: Some("en-US".into()),
        voice_id: None,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        queue_mode: QueueMode::Flush,
    }) {
        log::warn!("TTS speak failed: {error}");
    }
}

fn tempo_of(swing: Option<SwingData>) -> f32 {
    match swing {
        Some(swing)
            if swing.downswing_start > swing.backswing_start
                && swing.impact > swing.downswing_start =>
        {
            ((swing.downswing_start - swing.backswing_start) as f32)
                / ((swing.impact - swing.downswing_start) as f32)
        }
        _ => 0.0,
    }
}

fn format_speed(mph: f32, units: &str) -> String {
    let value = if units == "metric" {
        mph * 1.60934
    } else {
        mph
    };
    let unit = if units == "metric" {
        "kilometers per hour"
    } else {
        "miles per hour"
    };
    format!("{value:.1} {unit}")
}

fn format_degrees(value: f32) -> String {
    format!("{value:.1} degrees")
}

fn format_tempo(ratio: f32) -> String {
    let rounded = (ratio * 10.0).round() / 10.0;
    if rounded.fract() == 0.0 {
        format!("{rounded:.0}:1")
    } else {
        format!("{rounded:.1}:1")
    }
}

fn spoken_shot(shot: &ShotData, config: &VoiceConfig) -> String {
    let metrics = &config.metrics;
    let units = &config.units;
    let ball: Option<BallData> = shot.ball;
    let club: Option<ClubData> = shot.club;
    let swing: Option<SwingData> = shot.swing;
    let mut parts: Vec<String> = Vec::new();

    if metrics.club_speed {
        let mph = club.map_or(0.0, |c| c.club_head_speed * 2.23694);
        parts.push(format!("Club speed {}", format_speed(mph, units)));
    }
    if metrics.path {
        parts.push(format!(
            "Club path {}",
            format_degrees(club.map_or(0.0, |c| c.path_angle))
        ));
    }
    if metrics.face {
        parts.push(format!(
            "Face angle {}",
            format_degrees(club.map_or(0.0, |c| c.face_angle))
        ));
    }
    if metrics.attack {
        parts.push(format!(
            "Attack angle {}",
            format_degrees(club.map_or(0.0, |c| c.attack_angle))
        ));
    }
    if metrics.tempo {
        let tempo = tempo_of(swing);
        parts.push(if tempo > 0.0 {
            format!("Tempo {}", format_tempo(tempo))
        } else {
            "Tempo unavailable".into()
        });
    }
    if metrics.launch {
        parts.push(format!(
            "Launch angle {}",
            format_degrees(ball.map_or(0.0, |b| b.launch_angle))
        ));
    }
    if metrics.ball_speed {
        let mph = ball.map_or(0.0, |b| b.ball_speed * 2.23694);
        parts.push(format!("Ball speed {}", format_speed(mph, units)));
    }
    if metrics.spin {
        parts.push(format!(
            "Total spin {} RPM",
            ball.map_or(0.0, |b| b.total_spin)
        ));
    }

    parts.join(". ")
}

#[tauri::command]
async fn start_r10(
    app: AppHandle,
    state: State<'_, SessionState>,
    address: String,
    attempt_id: u64,
) -> Result<(), String> {
    let _lifecycle = state.lifecycle.lock().await;
    if *state
        .generation
        .lock()
        .map_err(|_| "session generation lock poisoned".to_string())?
        > attempt_id
    {
        return Err("Connection attempt cancelled".into());
    }
    if let Some(stop) = state
        .stop
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .take()
    {
        let _ = stop.send(());
    }
    *state
        .generation
        .lock()
        .map_err(|_| "session generation lock poisoned".to_string())? = attempt_id;

    let handler = get_handler().map_err(|error| error.to_string())?;
    if handler.is_connected() {
        cleanup_ble(handler).await;
        if handler.is_connected() {
            return Err("Previous Bluetooth connection could not be cleared".into());
        }
    }
    emit_connection(&app, attempt_id, "ble", "Connecting to Approach R10");
    if !handler.is_connected() {
        let disconnect_app = app.clone();
        let connect_result = tokio::time::timeout(
            Duration::from_secs(25),
            handler.connect(
                &address,
                OnDisconnectHandler::from_sync(move || {
                    emit_connection(
                        &disconnect_app,
                        attempt_id,
                        "disconnected",
                        "Bluetooth connection lost",
                    );
                }),
                false,
            ),
        )
        .await;
        match connect_result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                cleanup_ble(handler).await;
                schedule_late_disconnect(app.clone(), attempt_id, handler);
                return Err(error.to_string());
            }
            Err(_) => {
                cleanup_ble(handler).await;
                schedule_late_disconnect(app.clone(), attempt_id, handler);
                return Err(
                    "Bluetooth connection timed out. Turn the R10 off and on, then retry.".into(),
                );
            }
        }
        if *state
            .generation
            .lock()
            .map_err(|_| "session generation lock poisoned".to_string())?
            != attempt_id
        {
            cleanup_ble(handler).await;
            return Err("Connection attempt cancelled".into());
        }
    }

    emit_connection(
        &app,
        attempt_id,
        "multilink",
        "Bluetooth connected; opening Garmin MultiLink",
    );
    let (notification_tx, notification_rx) = mpsc::channel::<Vec<u8>>();
    let subscribe_result = tokio::time::timeout(
        Duration::from_secs(8),
        handler.subscribe(
            REGISTER_CHARACTERISTIC,
            Some(MULTILINK_SERVICE),
            move |data| {
                let _ = notification_tx.send(data);
            },
        ),
    )
    .await;
    match subscribe_result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            cleanup_ble(handler).await;
            return Err(error.to_string());
        }
        Err(_) => {
            cleanup_ble(handler).await;
            return Err("Timed out subscribing to Garmin MultiLink notifications".into());
        }
    }
    if *state
        .generation
        .lock()
        .map_err(|_| "session generation lock poisoned".to_string())?
        != attempt_id
    {
        cleanup_ble(handler).await;
        return Err("Connection attempt cancelled".into());
    }

    let mtu = handler.mtu().await.unwrap_or(23) as usize;
    let (stop_tx, stop_rx) = mpsc::channel();
    state
        .stop
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .replace(stop_tx);

    let thread_app = app.clone();
    let spawn_result = thread::Builder::new()
        .name("r10-session".into())
        .spawn(move || {
            let transport = BlecTransport {
                notifications: notification_rx,
                handler,
            };
            let mut client = Client::new(transport, mtu);
            if let Err(error) = client.start() {
                emit_connection(&thread_app, attempt_id, "error", error.to_string());
                tauri::async_runtime::block_on(async {
                    cleanup_owned_attempt(&thread_app, attempt_id, handler).await;
                });
                return;
            }
            let mut phase = "multilink";
            let mut phase_started = Instant::now();
            let mut cleanup_connection = true;
            loop {
                match stop_rx.try_recv() {
                    Ok(()) => {
                        cleanup_connection = false;
                        break;
                    }
                    Err(TryRecvError::Disconnected) => break,
                    Err(TryRecvError::Empty) => {}
                }
                if phase_started.elapsed() > Duration::from_secs(15) {
                    emit_connection(
                        &thread_app,
                        attempt_id,
                        "error",
                        format!("Timed out during {phase}. Power-cycle the R10 and retry."),
                    );
                    break;
                }
                match client.poll() {
                    Ok(Some(Event::Registered { .. })) => {
                        phase = "gfdi";
                        phase_started = Instant::now();
                        emit_connection(
                            &thread_app,
                            attempt_id,
                            "gfdi",
                            "MultiLink registered; negotiating GFDI",
                        );
                    }
                    Ok(Some(Event::HandshakeComplete)) => {
                        phase = "subscribe";
                        phase_started = Instant::now();
                        emit_connection(
                            &thread_app,
                            attempt_id,
                            "subscribe",
                            "GFDI ready; subscribing to launch monitor data",
                        );
                    }
                    Ok(Some(Event::Subscribed { success })) => {
                        if !success {
                            emit_connection(
                                &thread_app,
                                attempt_id,
                                "error",
                                "The R10 rejected the launch monitor subscription",
                            );
                            break;
                        }
                        phase = "wake";
                        phase_started = Instant::now();
                        emit_connection(
                            &thread_app,
                            attempt_id,
                            "wake",
                            "Subscription accepted; waking the R10",
                        );
                    }
                    Ok(Some(Event::WakeUpResponse { status })) => {
                        if status > 1 {
                            emit_connection(
                                &thread_app,
                                attempt_id,
                                "error",
                                format!("The R10 could not wake up (status {status})"),
                            );
                            break;
                        }
                        phase = "ready";
                        phase_started = Instant::now();
                        emit_connection(
                            &thread_app,
                            attempt_id,
                            "wake",
                            "R10 awake; waiting for ready state",
                        );
                    }
                    Ok(Some(Event::Shot(shot))) => {
                        let _ = thread_app.emit("r10://shot", &shot);
                        if let Ok(config) = thread_app.state::<VoiceState>().config.lock() {
                            if config.voice_enabled {
                                speak(&thread_app, spoken_shot(&shot, &config));
                            }
                        }
                    }
                    Ok(Some(Event::Ready)) => {
                        emit_connection(
                            &thread_app,
                            attempt_id,
                            "ready",
                            "Approach R10 ready for your next shot",
                        );
                        let voice_enabled = thread_app
                            .state::<VoiceState>()
                            .config
                            .lock()
                            .map(|config| config.voice_enabled)
                            .unwrap_or(false);
                        if voice_enabled {
                            speak(&thread_app, "Ready".into());
                        }
                        phase = "active";
                        phase_started = Instant::now();
                    }
                    Ok(Some(Event::DeviceError(error))) => {
                        emit_connection(
                            &thread_app,
                            attempt_id,
                            "device",
                            format!("R10 device warning: {error:?}"),
                        );
                    }
                    Ok(_) => {}
                    Err(error) => {
                        emit_connection(&thread_app, attempt_id, "error", error.to_string());
                        break;
                    }
                }
                if phase == "active" {
                    phase_started = Instant::now();
                }
                thread::sleep(Duration::from_millis(5));
            }
            if cleanup_connection {
                tauri::async_runtime::block_on(async {
                    cleanup_owned_attempt(&thread_app, attempt_id, handler).await;
                });
            }
        });
    if let Err(error) = spawn_result {
        state
            .stop
            .lock()
            .map_err(|_| "session state lock poisoned".to_string())?
            .take();
        cleanup_ble(handler).await;
        return Err(error.to_string());
    }
    drop(_lifecycle);
    Ok(())
}

fn stop_r10_worker(state: &SessionState) -> Result<(), String> {
    if let Some(stop) = state
        .stop
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .take()
    {
        let _ = stop.send(());
    }
    Ok(())
}

#[tauri::command]
async fn disconnect_r10(state: State<'_, SessionState>, attempt_id: u64) -> Result<(), String> {
    {
        let mut generation = state
            .generation
            .lock()
            .map_err(|_| "session generation lock poisoned".to_string())?;
        if attempt_id < *generation {
            return Ok(());
        }
        *generation = attempt_id;
    }
    let _lifecycle = state.lifecycle.lock().await;
    if *state
        .generation
        .lock()
        .map_err(|_| "session generation lock poisoned".to_string())?
        != attempt_id
    {
        return Ok(());
    }
    stop_r10_worker(&state)?;
    let handler = get_handler().map_err(|error| error.to_string())?;
    if handler.is_connected() {
        cleanup_ble(handler).await;
        if handler.is_connected() {
            return Err("Bluetooth disconnect timed out".into());
        }
    }
    Ok(())
}

#[tauri::command]
fn connection_info() -> &'static str {
    "Garmin R10 session uses 10over over tauri-plugin-blec"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SessionState::default())
        .manage(VoiceState::default())
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_tts::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_r10,
            disconnect_r10,
            set_voice_config,
            connection_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
