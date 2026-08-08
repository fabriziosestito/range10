# Flight model: libgolf → Rust port & carry-distance plan

## Objective
Give the R10 session computed **carry** + **total** distance using a pure-Rust
port of libgolf (`gdifiore/libgolf`, GPL-3.0, Nathan's flight model) in the
Rust backend. Full environment model (temp/elevation/wind/humidity/pressure),
no C++ toolchain pain, voice/TTS-ready (speech lives in Rust).

## Why libgolf over cf-math
- cf-math (`divotmaker/cyberflight`, Apache-2.0, Rust, Trackman-calibrated)
  models **only altitude + temperature** — no wind/humidity/pressure.
- libgolf has full `AtmosphericData` (temp °F, elevation ft, wind mph + dir,
  humidity %, pressure inHg).
- App is already GPL-3.0 → license compatible either way.
- Port size ~1.6k LOC (see source inventory below).

## Options considered — decision: PORT libgolf to Rust
| | cf-math dep | libgolf C++ FFI | Port libgolf → Rust |
|---|---|---|---|
| wind/humidity/pressure | ❌ | ✅ | ✅ |
| build complexity | none | C++ toolchain in iOS/macOS Tauri builds | none |
| license | Apache-2.0 | GPL-3.0 (compatible) | GPL-3.0 (compatible) |
| effort | ~0 | ~1d + ongoing fragility | ~2–3d, owned |
| TTS/voice integration | Rust | FFI structs across boundary | native Rust |

## libgolf source inventory (for the port)
- `include/DefaultAerodynamicModel.hpp` (inline, 342)
- `src/FlightPhase.cpp` (347) — phase machine, carry/total detection
- `src/FlightSimulator.cpp` (234)
- `include/DefaultBounceModel.hpp` (203)
- `src/math_utils.cpp` (166)
- `src/ShotPhysicsContext.cpp` (145)
- `include/DefaultRollModel.hpp` (135)
- `src/ground_physics.cpp` (34)
- `wasm/bindings.cpp` — `runShot()` result extraction (carry index after apex,
  apex, total, offline, time) — direct port reference.

## Sign conventions (verified across ecosystem)
- `launch_direction` (HLA): degrees, **positive = right of target**. Pass
  straight to `launch_azimuth_deg` (FRP spec says positive = right;
  `tenover::frp::convert.rs` maps 1:1; gsp-r10-adapter passes to GSPro HLA
  unnegated; cf-math expects the same).
- Spin split (WIRE.md): `backspin = total_spin * cos(spin_axis)`,
  `sidespin = total_spin * sin(spin_axis)` (tenover `BallData` already
  computes these — read them directly). Positive sidespin = curves right
  (FRP spec; matches libgolf/cf-math conventions). GSPro's spin_axis negation
  is GSPro-specific and ignored here.
- Still do a hardware sanity check (one slice + one hook) before trusting
  offline/lateral signs.

## Data mapping (R10 → flight model)
| Model input | Source |
|---|---|
| ball_speed_mph | `shot.ball.ball_speed` [m/s] × 2.23694 |
| launch_angle_deg | `shot.ball.launch_angle` |
| launch_azimuth_deg | `shot.ball.launch_direction` (no flip) |
| backspin_rpm | `shot.ball.backspin` (already decomposed) |
| sidespin_rpm | `shot.ball.sidespin` |
| atmospheric | app env settings; defaults = 70°F, 0 ft, 50 %, 29.92 inHg, no wind |
| surfaces | fairway for bounce + roll (hardcoded v1) |

## Environmental factors
- cf-math env = altitude + temperature only (barometric density); no wind.
  This is the deciding gap vs libgolf.
- We already exchange temp/humidity/altitude/air_density with the device via
  `ShotConfig` (sent on wake; see below) — single source of truth.
- App env settings rows (temperature, altitude, wind speed/direction,
  humidity, pressure) with standard-day defaults; sent to device AND used by
  the flight model.

## Calibration — R10 vs Trackman (chosen route)
- Real distance = Trackman. Session: R10 connected to app + Trackman on the
  range measuring actual flight.
- CSV inputs come from **our app** (R10 launch data): ball_speed_mph,
  launch_angle, direction, backspin, sidespin + env columns; truth columns
  `carry_yd/total_yd/apex_yd/side_yd` filled from Trackman.
- Harness = libgolf `tools/calibration/` (validation + regression gate, NOT
  an optimizer — constants tuned by hand):
  - `sim_runner.cpp` → small Rust CSV runner (same CSV contract)
  - `run.py` reused upstream (accepts any sim binary emitting the contract)
  - vendored reference `shots_reference.csv` (PGA+LPGA Tour 2023 Trackman
    averages; `--fast` CI subset)
  - thresholds: carry ≤5y pass, total ≤6y, apex ≤3y, side ≤3y
- Sign check first: mirrored side errors → flip HLA/spin mapping, not
  constants. Then tune aero/bounce/roll constants until driver+irons pass.
- Save `baseline.json`; later sessions gated via `--baseline` (1 yd tol).
- Expectation: end-to-end fit (R10 input noise + physics) → distances within
  a few yards of what you see on the range. Trackman-pure data stays cleaner
  physics-wise; R10-based matches the hardware better.

## Profiles (selectable in Settings)
- Profile = physics constant set:
  ```ts
  interface CalibrationProfile {
    id: string
    name: string
    aero: { cdSuper, cdSpin, srSat, clSub, spinDecay }
    bounce: { e_n, mu, kp }
    roll: { muSlide, muRoll }
  }
  ```
- Persist `profiles[]` + `activeProfileId` in `settings.json` prefs (same
  pattern as `teeDistance`); Rust `SessionState` holds the active profile
  (`set_calibration_profile` command); every shot uses it.
- Settings UI: "Calibration profile" row → picker + Import `profile.json`
  (from harness) + Rename/Delete/Reset-to-Default.
- Open decisions: constants-only vs bundling env defaults + surface; opaque
  JSON import vs editable fields; file-picker import vs bundled assets.

## Implementation steps
1. Port physics → `src-tauri/src/golf/…` (imperial, same constants): aero,
   bounce, roll, phase, simulator, atmos, math + `ShotResult`
   (carry/total/apex/offline/time + trajectory) with carry-index logic from
   `wasm/bindings.cpp::runShot`; take a `ModelConstants` (profile body)
   everywhere.
2. Wire `Event::Shot` → emit `carryYards`/`totalYards` in the event payload.
3. Frontend: `Shot` gains launch_direction/backspin/sidespin (already in
   payload); Log carry column; Stats carry metric; distance formatting via
   existing `yardsToMeters`.
4. "Export calibration CSV" in Log + Rust calib runner + vendored `run.py` +
   `make test` gate.
5. Settings: env rows + profile selector + import/export.
6. Verify `make check` + `make test`; hardware session vs Garmin app to
   validate signs.
