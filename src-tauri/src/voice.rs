use std::sync::Mutex;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_tts::{QueueMode, SpeakRequest, TtsExt};
use tenover::proto::{BallData, ClubData, SwingData};
use tenover::ShotData;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceConfig {
    #[serde(default = "default_voice_enabled")]
    pub voice_enabled: bool,
    #[serde(default = "default_units")]
    pub units: String,
    #[serde(default)]
    pub metrics: EnabledMetrics,
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
pub struct EnabledMetrics {
    pub club_speed: bool,
    pub path: bool,
    pub face: bool,
    pub attack: bool,
    pub tempo: bool,
    pub launch: bool,
    pub ball_speed: bool,
    pub spin: bool,
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
pub struct VoiceState {
    pub config: Mutex<VoiceConfig>,
}

pub fn speak(app: &AppHandle, text: String) {
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

pub fn tempo_of(swing: Option<SwingData>) -> f32 {
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

pub fn format_speed(mph: f32, units: &str) -> String {
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

pub fn format_degrees(value: f32) -> String {
    format!("{value:.1} degrees")
}

pub fn format_tempo(ratio: f32) -> String {
    let rounded = (ratio * 10.0).round() / 10.0;
    if rounded.fract() == 0.0 {
        format!("{rounded:.0}:1")
    } else {
        format!("{rounded:.1}:1")
    }
}

pub fn spoken_shot(shot: &ShotData, config: &VoiceConfig) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;
    use tenover::proto::{ShotData, ShotType, SpinCalcType, SwingData};

    fn shot_data() -> ShotData {
        ShotData {
            shot_id: 1,
            shot_type: ShotType::Normal,
            ball: None,
            club: None,
            swing: None,
        }
    }

    fn club_data() -> ClubData {
        ClubData {
            club_head_speed: 44.0,
            face_angle: 0.4,
            path_angle: 1.2,
            attack_angle: -3.1,
        }
    }

    fn ball_data() -> BallData {
        BallData {
            launch_angle: 16.5,
            launch_direction: 0.0,
            ball_speed: 64.7,
            spin_axis: 0.0,
            total_spin: 2420.0,
            backspin: 2420.0,
            sidespin: 0.0,
            spin_calc_type: SpinCalcType::Ratio,
        }
    }

    fn swing_data() -> SwingData {
        SwingData {
            backswing_start: 0,
            downswing_start: 700,
            impact: 1000,
            follow_through_end: 1400,
        }
    }

    fn metrics_all() -> EnabledMetrics {
        EnabledMetrics {
            club_speed: true,
            path: true,
            face: true,
            attack: true,
            tempo: true,
            launch: true,
            ball_speed: true,
            spin: true,
        }
    }

    #[test]
    fn tempo_of_computes_backswing_over_downswing() {
        let ratio = tempo_of(Some(swing_data()));
        assert!((ratio - 700.0 / 300.0).abs() < f32::EPSILON);
    }

    #[test]
    fn tempo_of_is_zero_without_swing() {
        assert_eq!(tempo_of(None), 0.0);
    }

    #[test]
    fn tempo_of_is_zero_for_inverted_timestamps() {
        let swing = SwingData {
            backswing_start: 0,
            downswing_start: 800,
            impact: 500,
            follow_through_end: 1400,
        };
        assert_eq!(tempo_of(Some(swing)), 0.0);
    }

    #[test]
    fn format_speed_keeps_mph_in_imperial() {
        assert_eq!(format_speed(98.4, "imperial"), "98.4 miles per hour");
    }

    #[test]
    fn format_speed_converts_to_kph_in_metric() {
        assert_eq!(format_speed(98.4, "metric"), "158.4 kilometers per hour");
    }

    #[test]
    fn format_degrees_rounds_to_one_decimal() {
        assert_eq!(format_degrees(1.24), "1.2 degrees");
        assert_eq!(format_degrees(-3.14), "-3.1 degrees");
    }

    #[test]
    fn format_tempo_integer_and_fractional() {
        assert_eq!(format_tempo(3.0), "3:1");
        assert_eq!(format_tempo(3.05), "3.1:1");
    }

    #[test]
    fn spoken_shot_announces_only_enabled_metrics() {
        let shot = ShotData {
            club: Some(club_data()),
            ..shot_data()
        };
        let config = VoiceConfig {
            metrics: EnabledMetrics {
                tempo: false,
                ..Default::default()
            },
            ..Default::default()
        };
        assert_eq!(
            spoken_shot(&shot, &config),
            "Club speed 98.4 miles per hour. Club path 1.2 degrees. Attack angle -3.1 degrees"
        );
    }

    #[test]
    fn spoken_shot_falls_back_when_club_and_ball_missing() {
        let shot = ShotData {
            swing: Some(swing_data()),
            club: Some(club_data()),
            ball: Some(ball_data()),
            ..shot_data()
        };
        let missing_config = VoiceConfig {
            metrics: metrics_all(),
            ..Default::default()
        };
        let spoken = spoken_shot(&shot, &missing_config);
        assert!(spoken.contains("Club speed 98.4 miles per hour"));
        assert!(spoken.contains("Tempo 2.3:1"));
        assert!(spoken.contains("Ball speed 144.7 miles per hour"));
        assert!(spoken.contains("Total spin 2420 RPM"));
    }

    #[test]
    fn spoken_shot_metric_truth() {
        let shot = ShotData {
            ball: None,
            club: None,
            swing: None,
            ..shot_data()
        };
        let config = VoiceConfig {
            metrics: metrics_all(),
            ..Default::default()
        };
        let spoken = spoken_shot(&shot, &config);
        assert!(spoken.contains("Ball speed 0.0 miles per hour"));
        assert!(spoken.contains("Tempo unavailable"));
    }
}
