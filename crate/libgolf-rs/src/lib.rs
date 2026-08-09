// libgolf-rs — pure-Rust port of libgolf
// (https://github.com/gdifiore/libgolf). libgolf Copyright (C) gdifiore,
// licensed under the GNU General Public License v3.0; the in-air physics is
// based on Prof. Alan M. Nathan's trajectory model (University of Illinois).
//
// This file is a ported, modified version of the libgolf source and is part
// of range10. Copyright (C) 2026 range10 contributors.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

//! Pure-Rust port of the [libgolf](https://github.com/gdifiore/libgolf) golf
//! ball flight model.
//!
//! Simulates a golf ball's full flight — aerial arc, bounce, and roll — from
//! launch conditions and atmosphere, and reports carry, total, apex, and
//! offline distances. All values are in imperial units: distances in yards,
//! heights in feet, speeds in feet per second or miles per hour, spin in RPM.
//!
//! # Usage
//!
//! ```
//! use libgolf_rs::{run_shot, AtmosphericData, GroundSurface, LaunchData};
//!
//! let launch = LaunchData {
//!     ball_speed_mph: 160.0,
//!     launch_angle_deg: 11.0,
//!     backspin_rpm: 3000.0,
//!     ..Default::default()
//! };
//! let atmos = AtmosphericData {
//!     temp_f: 70.0,
//!     rel_humidity: 50.0,
//!     ..Default::default()
//! };
//! let result = run_shot(launch, atmos, GroundSurface::default()).unwrap();
//!
//! assert!((result.carry_yards - 259.4).abs() < 0.1);
//! assert!((result.total_yards - 264.7).abs() < 0.1);
//! ```
//!
//! # Structure
//!
//! - [`simulator`] — the flight phase machine ([`Simulator`], [`run_shot`]).
//! - [`data`] — launch, atmosphere, ball, ground, and per-shot physics inputs.
//! - [`aero`] — drag, lift (Magnus), and spin decay for the aerial phase.
//! - [`bounce`] / [`roll`] — ground contact models.
//! - [`constants`] — physical constants and unit conversions.
//! - [`vector`] — `Vector3d` math helpers.

#![warn(missing_docs)]

pub mod aero;
pub mod bounce;
pub mod constants;
pub mod data;
pub mod roll;
pub mod simulator;
pub mod vector;

pub use data::{AtmosphericData, GroundSurface, LaunchData};
pub use simulator::run_shot;
