use std::io;
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_blec::models::WriteType;
use tauri_plugin_blec::{get_handler, Handler, OnDisconnectHandler};
use tenover::proto::ShotConfig;
use tenover::{Client, Event, Transport};
use uuid::{uuid, Uuid};

use golf::{AtmosphericData, GroundSurface, LaunchData};
use voice::{speak, spoken_shot, VoiceConfig, VoiceState};

mod golf;
mod voice;

const MULTILINK_SERVICE: Uuid = uuid!("6a4e2800-667b-11e3-949a-0800200c9a66");
const REGISTER_CHARACTERISTIC: Uuid = uuid!("6a4e2810-667b-11e3-949a-0800200c9a66");
const DATA_CHARACTERISTIC: Uuid = uuid!("6a4e2820-667b-11e3-949a-0800200c9a66");

const DEFAULT_TEE_DISTANCE_YARDS: f32 = 2.3;

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
    match golf::run_shot(launch, DEFAULT_ATMOS, GroundSurface::default()) {
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
        tauri::async_runtime::block_on(self.handler.send_data(
            DATA_CHARACTERISTIC,
            Some(MULTILINK_SERVICE),
            data,
            WriteType::WithoutResponse,
        ))
        .map_err(|error| io::Error::other(error.to_string()))
    }

    fn write_register(&mut self, data: &[u8]) -> Result<(), io::Error> {
        tauri::async_runtime::block_on(self.handler.send_data(
            REGISTER_CHARACTERISTIC,
            Some(MULTILINK_SERVICE),
            data,
            WriteType::WithResponse,
        ))
        .map_err(|error| io::Error::other(error.to_string()))
    }
}

#[tauri::command]
async fn start_r10(
    app: AppHandle,
    state: State<'_, SessionState>,
    address: String,
) -> Result<(), String> {
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
    thread::Builder::new()
        .name("r10-voice".into())
        .spawn(move || {
            while let Ok(text) = voice_rx.recv() {
                speak(&voice_app, text);
            }
        })
        .map_err(|error| error.to_string())?;

    thread::Builder::new()
        .name("r10-session".into())
        .spawn(move || {
            let transport = BlecTransport {
                notifications: notification_rx,
                handler,
            };
            let mut client = Client::new(transport, mtu);
            if let Err(error) = client.start() {
                let _ = app.emit("r10://error", error.to_string());
                return;
            }
            loop {
                if stop_rx.try_recv().is_ok() {
                    break;
                }
                if client.phase() == "active" {
                    while let Ok(yards) = tee_rx.try_recv() {
                        let config = ShotConfig {
                            tee_range: Some(yards),
                            ..ShotConfig::default()
                        };
                        if let Err(error) = client.send_shot_config(&config) {
                            let _ = app.emit("r10://error", error.to_string());
                            break;
                        }
                    }
                }
                match client.poll() {
                    Ok(Some(Event::Registered { .. })) => {
                        let _ = app.emit("r10://stage", "registered");
                    }
                    Ok(Some(Event::HandshakeComplete)) => {
                        let _ = app.emit("r10://stage", "handshake-complete");
                    }
                    Ok(Some(Event::Subscribed { .. })) => {
                        let _ = app.emit("r10://stage", "subscribed");
                    }
                    Ok(Some(Event::Shot(shot))) => {
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
                        let _ = app.emit("r10://stage", "waking");
                        let yards = app
                            .state::<SessionState>()
                            .tee_yards
                            .lock()
                            .map(|state| *state)
                            .unwrap_or(DEFAULT_TEE_DISTANCE_YARDS);
                        let config = ShotConfig {
                            tee_range: Some(yards),
                            ..ShotConfig::default()
                        };
                        if let Err(error) = client.send_shot_config(&config) {
                            let _ = app.emit("r10://error", error.to_string());
                        }
                    }
                    Ok(Some(Event::ShotConfigResponse { success })) => {
                        if !success {
                            log::warn!("R10 rejected tee distance configuration");
                            let _ = app.emit("r10://error", "tee config rejected".to_string());
                        } else {
                            log::info!("R10 accepted tee distance configuration");
                        }
                    }
                    Ok(Some(Event::DeviceError(error))) => {
                        let _ = app.emit("r10://device-error", error);
                    }
                    Ok(_) => {}
                    Err(error) => {
                        let _ = app.emit("r10://error", error.to_string());
                        break;
                    }
                }
                thread::sleep(Duration::from_millis(5));
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn stop_r10(state: State<'_, SessionState>) -> Result<(), String> {
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
            stop_r10,
            set_voice_config,
            set_tee_distance,
            connection_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
