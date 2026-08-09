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

pub mod aero;
pub mod bounce;
pub mod constants;
pub mod data;
pub mod roll;
pub mod simulator;
pub mod vector;

pub use data::{AtmosphericData, GroundSurface, LaunchData};
pub use simulator::run_shot;
