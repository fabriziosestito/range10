use std::io;
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_blec::models::WriteType;
use tauri_plugin_blec::{get_handler, OnDisconnectHandler};
use tenover::proto::ShotConfig;
use tenover::{Client, Event, Transport};
use uuid::{uuid, Uuid};

use libgolf_rs::{AtmosphericData, GroundSurface, LaunchData};
use voice::{speak, spoken_shot, VoiceConfig, VoiceState};

mod voice;

const MULTILINK_SERVICE: Uuid = uuid!("6a4e2800-667b-11e3-949a-0800200c9a66");
const REGISTER_CHARACTERISTIC: Uuid = uuid!("6a4e2810-667b-11e3-949a-0800200c9a66");
const DATA_CHARACTERISTIC: Uuid = uuid!("6a4e2820-667b-11e3-949a-0800200c9a66");

const DEFAULT_TEE_DISTANCE_YARDS: f32 = 2.3;

const WRITE_QUEUE_CAPACITY: usize = 64;
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);

const DEFAULT_ATMOS: AtmosphericData = AtmosphericData {
    temp_f: 70.0,
    elevation_ft: 0.0,
    wind_mph: 0.0,
    wind_direction_deg: 0.0,
    wind_height_ft: 0.0,
    rel_humidity: 50.0,
    pressure_inhg: 29.92,
};

#[derive(serde::Serialize)]
struct ShotMetrics {
    shot_id: u32,
    carry_yards: f32,
    total_yards: f32,
    apex_yards: f32,
    offline_yards: f32,
    time_of_flight: f32,
}

fn compute_shot_metrics(shot: &tenover::proto::ShotData) -> Option<ShotMetrics> {
    let ball = shot.ball?;
    let launch = LaunchData {
        ball_speed_mph: ball.ball_speed * 2.23694,
        launch_angle_deg: ball.launch_angle,
        direction_deg: ball.launch_direction,
        backspin_rpm: ball.backspin,
        sidespin_rpm: ball.sidespin,
        ..Default::default()
    };
    match libgolf_rs::run_shot(launch, DEFAULT_ATMOS, GroundSurface::default()) {
        Ok(result) => Some(ShotMetrics {
            shot_id: shot.shot_id,
            carry_yards: result.carry_yards,
            total_yards: result.total_yards,
            apex_yards: result.apex_yards,
            offline_yards: result.offline_yards,
            time_of_flight: result.time_of_flight,
        }),
        Err(error) => {
            log::warn!(
                "flight simulation failed for shot {}: {error}",
                shot.shot_id
            );
            None
        }
    }
}

struct SessionState {
    stop: Mutex<Option<Sender<()>>>,
    tee: Mutex<Option<Sender<f32>>>,
    tee_yards: Mutex<f32>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            stop: Mutex::new(None),
            tee: Mutex::new(None),
            tee_yards: Mutex::new(DEFAULT_TEE_DISTANCE_YARDS),
        }
    }
}

#[tauri::command]
fn set_voice_config(state: State<'_, VoiceState>, config: VoiceConfig) -> Result<(), String> {
    *state
        .config
        .lock()
        .map_err(|_| "voice config lock poisoned".to_string())? = config;
    Ok(())
}

#[tauri::command]
fn set_tee_distance(state: State<'_, SessionState>, yards: f32) -> Result<(), String> {
    let mut tee_yards = state
        .tee_yards
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?;
    *tee_yards = yards;
    if let Some(tee) = state
        .tee
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .as_ref()
    {
        let _ = tee.send(yards);
    }
    Ok(())
}

struct BleWrite {
    characteristic: Uuid,
    write_type: WriteType,
    payload: Vec<u8>,
}

struct BlecTransport {
    notifications: Receiver<Vec<u8>>,
    writes: tokio::sync::mpsc::Sender<BleWrite>,
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
        self.send(data, false)
    }

    fn write_register(&mut self, data: &[u8]) -> Result<(), io::Error> {
        self.send(data, true)
    }
}

impl BlecTransport {
    /// Enqueue a write on the ordered writer task without blocking.
    ///
    /// There is deliberately no timeout: while iOS suspends the app between
    /// BLE background wake windows a write can land seconds late and still
    /// be perfectly valid. A full queue means the link is genuinely wedged.
    fn send(&self, data: &[u8], register: bool) -> Result<(), io::Error> {
        let write = BleWrite {
            characteristic: if register {
                REGISTER_CHARACTERISTIC
            } else {
                DATA_CHARACTERISTIC
            },
            write_type: if register {
                WriteType::WithResponse
            } else {
                WriteType::WithoutResponse
            },
            payload: data.to_vec(),
        };
        use tokio::sync::mpsc::error::TrySendError;
        match self.writes.try_send(write) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => Err(io::Error::other("BLE write queue full")),
            Err(TrySendError::Closed(_)) => Err(io::Error::from(io::ErrorKind::BrokenPipe)),
        }
    }
}

#[tauri::command]
async fn start_r10(
    app: AppHandle,
    state: State<'_, SessionState>,
    address: String,
) -> Result<(), String> {
    if let Some(stop) = state
        .stop
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .take()
    {
        let _ = stop.send(());
    }
    let handler = get_handler().map_err(|error| error.to_string())?;
    if !handler.is_connected() {
        handler
            .connect(&address, OnDisconnectHandler::from_sync(|| {}), false)
            .await
            .map_err(|error| error.to_string())?;
    }

    let (notification_tx, notification_rx) = mpsc::channel::<Vec<u8>>();
    handler
        .subscribe(
            REGISTER_CHARACTERISTIC,
            Some(MULTILINK_SERVICE),
            move |data| {
                let _ = notification_tx.send(data);
            },
        )
        .await
        .map_err(|error| error.to_string())?;

    let mtu = handler.mtu().await.unwrap_or(23) as usize;
    let (stop_tx, stop_rx) = mpsc::channel();
    state
        .stop
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .replace(stop_tx);
    let (tee_tx, tee_rx) = mpsc::channel();
    state
        .tee
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .replace(tee_tx);

    let (voice_tx, voice_rx) = mpsc::channel::<String>();
    let voice_app = app.clone();
    let session_id = Uuid::new_v4();
    log::info!("[{session_id}] R10 session starting -> {address}");
    thread::Builder::new()
        .name("r10-voice".into())
        .spawn(move || {
            while let Ok(text) = voice_rx.recv() {
                speak(&voice_app, text);
            }
        })
        .map_err(|error| error.to_string())?;

    // Single ordered writer: preserves chunk order and lets writes queued
    // while iOS suspends the app flush in the next BLE wake window.
    let (write_tx, mut write_rx) = tokio::sync::mpsc::channel::<BleWrite>(WRITE_QUEUE_CAPACITY);
    tauri::async_runtime::spawn(async move {
        while let Some(write) = write_rx.recv().await {
            if let Err(error) = handler
                .send_data(
                    write.characteristic,
                    Some(MULTILINK_SERVICE),
                    &write.payload,
                    write.write_type,
                )
                .await
            {
                log::warn!("[{session_id}] BLE write failed: {error}");
            }
        }
        log::info!("[{session_id}] BLE writer stopped");
    });

    thread::Builder::new()
        .name("r10-session".into())
        .spawn(move || {
            let transport = BlecTransport {
                notifications: notification_rx,
                writes: write_tx,
            };
            let mut client = Client::new(transport, mtu);
            if let Err(error) = client.start() {
                log::error!("[{session_id}] R10 session start failed: {error}");
                let _ = app.emit("r10://error", error.to_string());
                log::info!("[{session_id}] R10 session ended: start failure");
                return;
            }
            let mut last_heartbeat = std::time::Instant::now();
            let mut last_tee_yards_sent: Option<f32> = None;
            loop {
                if stop_rx.try_recv().is_ok() {
                    log::info!("[{session_id}] R10 session ended: stopped");
                    break;
                }
                if client.phase() == "active" {
                    while let Ok(yards) = tee_rx.try_recv() {
                        if Some(yards) == last_tee_yards_sent {
                            continue;
                        }
                        let config = ShotConfig {
                            tee_range: Some(yards),
                            ..ShotConfig::default()
                        };
                        if let Err(error) = client.send_shot_config(&config) {
                            log::error!(
                                "[{session_id}] failed to send tee distance configuration: {error}"
                            );
                            let _ = app.emit("r10://error", error.to_string());
                            break;
                        }
                        last_tee_yards_sent = Some(yards);
                    }
                }
                match client.poll() {
                    Ok(Some(Event::Registered { .. })) => {
                        log::info!("[{session_id}] R10 registered");
                        let _ = app.emit("r10://stage", "registered");
                    }
                    Ok(Some(Event::HandshakeComplete)) => {
                        log::info!("[{session_id}] R10 handshake complete");
                        let _ = app.emit("r10://stage", "handshake-complete");
                    }
                    Ok(Some(Event::Subscribed { .. })) => {
                        log::info!("[{session_id}] subscribed to R10");
                        let _ = app.emit("r10://stage", "subscribed");
                    }
                    Ok(Some(Event::Shot(shot))) => {
                        log::info!("[{session_id}] R10 shot {}", shot.shot_id);
                        let _ = app.emit("r10://shot", &shot);
                        if let Some(metrics) = compute_shot_metrics(&shot) {
                            let _ = app.emit("r10://shot-metrics", &metrics);
                        }
                        if let Ok(config) = app.state::<VoiceState>().config.lock() {
                            if config.voice_enabled {
                                let _ = voice_tx.send(spoken_shot(&shot, &config));
                            }
                        }
                    }
                    Ok(Some(Event::WakeUpResponse { .. })) => {
                        log::info!("[{session_id}] R10 woke up");
                        let _ = app.emit("r10://stage", "waking");
                        let yards = app
                            .state::<SessionState>()
                            .tee_yards
                            .lock()
                            .map(|state| *state)
                            .unwrap_or(DEFAULT_TEE_DISTANCE_YARDS);
                        if Some(yards) != last_tee_yards_sent {
                            let config = ShotConfig {
                                tee_range: Some(yards),
                                ..ShotConfig::default()
                            };
                            if let Err(error) = client.send_shot_config(&config) {
                                log::error!(
                                    "[{session_id}] failed to send tee distance configuration: {error}"
                                );
                                let _ = app.emit("r10://error", error.to_string());
                            } else {
                                last_tee_yards_sent = Some(yards);
                            }
                        }
                    }
                    Ok(Some(Event::ShotConfigResponse { success })) => {
                        if !success {
                            log::warn!("[{session_id}] R10 rejected tee distance configuration");
                            let _ = app.emit("r10://error", "tee config rejected".to_string());
                        } else {
                            log::info!("[{session_id}] R10 accepted tee distance configuration");
                        }
                    }
                    Ok(Some(Event::DeviceError(error))) => {
                        log::warn!("[{session_id}] R10 reported a device error: {error:?}");
                        let _ = app.emit("r10://device-error", error);
                    }
                    Ok(_) => {}
                    Err(error) => match error {
                        tenover::Error::Transport(inner) => {
                            log::error!("[{session_id}] R10 session transport failure: {inner}");
                            let _ = app.emit("r10://session-end", inner.to_string());
                            let _ = app.emit("r10://error", inner.to_string());
                            log::info!("[{session_id}] R10 session ended: transport failure");
                            break;
                        }
                        other => {
                            log::warn!("[{session_id}] R10 protocol warning, continuing: {other}");
                        }
                    },
                }
                if last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
                    last_heartbeat = std::time::Instant::now();
                    let _ = app.emit("r10://heartbeat", ());
                }
                thread::sleep(Duration::from_millis(5));
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn stop_r10(state: State<'_, SessionState>) -> Result<(), String> {
    if let Some(stop) = state
        .stop
        .lock()
        .map_err(|_| "session state lock poisoned".to_string())?
        .take()
    {
        let _ = stop.send(());
    }
    if let Ok(handler) = get_handler() {
        let _ = tauri::async_runtime::spawn(async move {
            if let Err(error) = handler.unsubscribe(REGISTER_CHARACTERISTIC).await {
                log::warn!("failed to unsubscribe from R10 notifications: {error}");
            }
        })
        .await;
    }
    Ok(())
}

#[tauri::command]
fn connection_info() -> &'static str {
    "Garmin R10 session uses 10over over tauri-plugin-blec"
}

#[tauri::command]
fn read_app_log(app: AppHandle) -> Result<String, String> {
    use std::fs;
    use std::time::UNIX_EPOCH;

    let dir = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    let mut newest: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for entry in fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "log") {
            let modified = fs::metadata(&path)
                .and_then(|meta| meta.modified())
                .unwrap_or(UNIX_EPOCH);
            if newest.as_ref().is_none_or(|(t, _)| modified > *t) {
                newest = Some((modified, path));
            }
        }
    }
    let path = newest
        .map(|(_, path)| path)
        .ok_or_else(|| "no log file found yet".to_string())?;
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let tail_start = lines.len().saturating_sub(400);
    Ok(lines[tail_start..].join("\n"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SessionState::default())
        .manage(VoiceState::default())
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_tts::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .format(|out, message, record| {
                    let format = time::macros::format_description!(
                        "[[[year]-[month]-[day]][[[hour]:[minute]:[second]]"
                    );
                    let now = tauri_plugin_log::TimezoneStrategy::UseLocal.get_now();
                    out.finish(format_args!(
                        "{}[{}][{}] {}",
                        now.format(&format)
                            .unwrap_or_else(|_| "[unknown time]".into()),
                        record.level(),
                        record.target(),
                        message
                    ));
                })
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .build(),
        )
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            start_r10,
            stop_r10,
            set_voice_config,
            set_tee_distance,
            connection_info,
            read_app_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
