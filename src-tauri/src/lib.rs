use std::io;
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_blec::models::WriteType;
use tauri_plugin_blec::{get_handler, Handler, OnDisconnectHandler};
use tenover::{Client, Event, Transport};
use uuid::{uuid, Uuid};

use voice::{speak, spoken_shot, VoiceConfig, VoiceState};

mod voice;

const MULTILINK_SERVICE: Uuid = uuid!("6a4e2800-667b-11e3-949a-0800200c9a66");
const REGISTER_CHARACTERISTIC: Uuid = uuid!("6a4e2810-667b-11e3-949a-0800200c9a66");
const DATA_CHARACTERISTIC: Uuid = uuid!("6a4e2820-667b-11e3-949a-0800200c9a66");

#[derive(Default)]
struct SessionState {
    stop: Mutex<Option<Sender<()>>>,
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
                    Ok(Some(Event::WakeUpResponse { .. })) => {
                        let _ = app.emit("r10://stage", "waking");
                    }
                    Ok(Some(Event::Shot(shot))) => {
                        let _ = app.emit("r10://shot", &shot);
                        if let Ok(config) = app.state::<VoiceState>().config.lock() {
                            if config.voice_enabled {
                                speak(&app, spoken_shot(&shot, &config));
                            }
                        }
                    }
                    Ok(Some(Event::Ready)) => {
                        let _ = app.emit("r10://ready", ());
                        let voice_enabled = app
                            .state::<VoiceState>()
                            .config
                            .lock()
                            .map(|config| config.voice_enabled)
                            .unwrap_or(false);
                        if voice_enabled {
                            speak(&app, "Ready".into());
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
            connection_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
