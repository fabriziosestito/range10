use crate::constants;
use crate::data::ShotPhysicsContext;
use crate::vector::Vector3d;

pub struct AerodynamicState {
    pub velocity: Vector3d,
    pub wind_velocity: Vector3d,
    pub spin_vector: Vector3d,
    pub ball_radius: f32,
    pub c0: f32,
    pub re100: f32,
}

const TAU_COEFF: f32 = 0.00002;

const RE_THRESHOLD_LOW: f32 = 0.5;
const RE_THRESHOLD_HIGH: f32 = 1.0;
const RE_SCALE_FACTOR: f32 = 0.00001;
const RE_VELOCITY_DIVISOR: f32 = 100.0;

const CD_SPIN: f32 = 0.180;
const CD_LOW: f32 = 0.500;
const CD_HIGH: f32 = 0.200;

const RE_BIN_NO_LIFT_X_E5: f32 = 0.3;
const RE_BIN_LOW_X_E5: f32 = 0.5;
const RE_BIN_MID_LOW_X_E5: f32 = 0.6;
const RE_BIN_MID_HIGH_X_E5: f32 = 0.65;
const RE_BIN_HIGH_X_E5: f32 = 0.7;

const CL_RE50K_A0: f32 = 0.0472121;
const CL_RE50K_A1: f32 = 2.84795;
const CL_RE50K_A2: f32 = -23.4342;
const CL_RE50K_A3: f32 = 45.4849;

const CL_RE60K_A0: f32 = 0.320524;
const CL_RE60K_A1: f32 = -4.7032;
const CL_RE60K_A2: f32 = 14.0613;

const CL_RE65K_A0: f32 = 0.266667;
const CL_RE65K_A1: f32 = -4.0;
const CL_RE65K_A2: f32 = 13.3333;

const CL_RE70K_A0: f32 = 0.0496189;
const CL_RE70K_A1: f32 = 0.00211396;
const CL_RE70K_A2: f32 = 2.34201;

const CL_MAX_BASE: f32 = 0.268;
const CL_MAX_HIGH_SR: f32 = 0.320;
const CL_MAX_SR_LERP_LOW: f32 = 0.35;
const CL_MAX_SR_LERP_HIGH: f32 = 0.50;

const HIGH_RE_SPIN_GAIN: f32 = 16.0;

pub fn spin_decay_tau(state: &AerodynamicState) -> f32 {
    let v = state.velocity.magnitude();
    1.0 / (TAU_COEFF * v / state.ball_radius)
}

pub fn compute_acceleration(state: &AerodynamicState) -> Vector3d {
    let v_rel = state.velocity - state.wind_velocity;
    let vw = (v_rel.0 as f64 * v_rel.0 as f64
        + v_rel.1 as f64 * v_rel.1 as f64
        + v_rel.2 as f64 * v_rel.2 as f64)
        .sqrt();

    if vw < constants::MIN_SPEED as f64 {
        return Vector3d::ZERO;
    }

    let vw_mph = vw / constants::MPH_TO_FT_PER_S as f64;
    let re_x_e5 =
        (vw_mph / RE_VELOCITY_DIVISOR as f64) * state.re100 as f64 * RE_SCALE_FACTOR as f64;

    let omega_mag = (state.spin_vector.0 as f64 * state.spin_vector.0 as f64
        + state.spin_vector.1 as f64 * state.spin_vector.1 as f64
        + state.spin_vector.2 as f64 * state.spin_vector.2 as f64)
        .sqrt();
    let spin_factor = omega_mag * state.ball_radius as f64 / vw;

    let cd = compute_cd(re_x_e5, spin_factor);
    let cl = compute_cl(re_x_e5, spin_factor);

    let drag_scale = -(state.c0 as f64) * cd * vw;
    let drag = Vector3d(
        (drag_scale * v_rel.0 as f64) as f32,
        (drag_scale * v_rel.1 as f64) as f32,
        (drag_scale * v_rel.2 as f64) as f32,
    );

    let mut magnus = Vector3d::ZERO;
    if omega_mag > constants::MIN_SPIN as f64 {
        let magnus_scale = state.c0 as f64 * (cl / omega_mag) * vw;
        magnus = Vector3d(
            (magnus_scale
                * (state.spin_vector.1 as f64 * v_rel.2 as f64
                    - state.spin_vector.2 as f64 * v_rel.1 as f64)) as f32,
            (magnus_scale
                * (state.spin_vector.2 as f64 * v_rel.0 as f64
                    - state.spin_vector.0 as f64 * v_rel.2 as f64)) as f32,
            (magnus_scale
                * (state.spin_vector.0 as f64 * v_rel.1 as f64
                    - state.spin_vector.1 as f64 * v_rel.0 as f64)) as f32,
        );
    }

    drag + magnus
}

pub(crate) fn compute_cd(re_x_e5: f64, spin_factor: f64) -> f64 {
    let cd_low = CD_LOW as f64;
    let cd_high = CD_HIGH as f64;
    let re_low = RE_THRESHOLD_LOW as f64;
    let re_high = RE_THRESHOLD_HIGH as f64;
    let cd_spin = CD_SPIN as f64;

    if re_x_e5 <= re_low {
        cd_low + cd_spin * spin_factor
    } else if re_x_e5 < re_high {
        cd_low - (cd_low - cd_high) * (re_x_e5 - re_low) / (re_high - re_low)
            + cd_spin * spin_factor
    } else {
        cd_high + cd_spin * spin_factor
    }
}

pub(crate) fn compute_cl(re_x_e5: f64, spin_factor: f64) -> f64 {
    let s = spin_factor.max(0.0);
    if s <= 0.0 {
        return 0.0;
    }

    let cl_max = cl_max_for_spin_factor(s);
    let re_no_lift = RE_BIN_NO_LIFT_X_E5 as f64;
    let re_low = RE_BIN_LOW_X_E5 as f64;
    let re_mid_low = RE_BIN_MID_LOW_X_E5 as f64;
    let re_mid_high = RE_BIN_MID_HIGH_X_E5 as f64;
    let re_high = RE_BIN_HIGH_X_E5 as f64;

    if re_x_e5 <= re_no_lift {
        return 0.0;
    }

    if re_x_e5 < re_low {
        let t = smooth_step01((re_x_e5 - re_no_lift) / (re_low - re_no_lift));
        return (cl_re50k(s) * t).clamp(0.0, cl_max);
    }

    if re_x_e5 >= re_high {
        let g = HIGH_RE_SPIN_GAIN as f64;
        return (cl_max * s * g / (1.0 + s * g)).clamp(0.0, cl_max);
    }

    let (re_a, re_b, cl_a, cl_b) = if re_x_e5 < re_mid_low {
        (re_low, re_mid_low, cl_re50k(s), cl_re60k(s))
    } else if re_x_e5 < re_mid_high {
        (re_mid_low, re_mid_high, cl_re60k(s), cl_re65k(s))
    } else {
        (re_mid_high, re_high, cl_re65k(s), cl_re70k(s))
    };
    let w = (re_x_e5 - re_a) / (re_b - re_a);
    (cl_a + (cl_b - cl_a) * w).clamp(0.0, cl_max)
}

fn smooth_step01(x: f64) -> f64 {
    let t = x.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn cl_max_for_spin_factor(s: f64) -> f64 {
    let base = CL_MAX_BASE as f64;
    let high = CL_MAX_HIGH_SR as f64;
    let s_low = CL_MAX_SR_LERP_LOW as f64;
    let s_high = CL_MAX_SR_LERP_HIGH as f64;
    if s <= s_low {
        base
    } else if s >= s_high {
        high
    } else {
        base + (high - base) * (s - s_low) / (s_high - s_low)
    }
}

fn cl_re50k(s: f64) -> f64 {
    CL_RE50K_A0 as f64
        + CL_RE50K_A1 as f64 * s
        + CL_RE50K_A2 as f64 * s * s
        + CL_RE50K_A3 as f64 * s * s * s
}

fn cl_re60k(s: f64) -> f64 {
    CL_RE60K_A0 as f64 + CL_RE60K_A1 as f64 * s + CL_RE60K_A2 as f64 * s * s
}

fn cl_re65k(s: f64) -> f64 {
    CL_RE65K_A0 as f64 + CL_RE65K_A1 as f64 * s + CL_RE65K_A2 as f64 * s * s
}

fn cl_re70k(s: f64) -> f64 {
    CL_RE70K_A0 as f64 + CL_RE70K_A1 as f64 * s + CL_RE70K_A2 as f64 * s * s
}

pub fn build_state(
    state: &crate::data::BallState,
    context: &ShotPhysicsContext,
    ball_radius: f32,
) -> AerodynamicState {
    let wind = if state.position.2 >= context.height_wind() {
        context.vw()
    } else {
        Vector3d::ZERO
    };
    AerodynamicState {
        velocity: state.velocity,
        wind_velocity: Vector3d(wind.0, wind.1, 0.0),
        spin_vector: state.spin_vector,
        ball_radius,
        c0: context.c0(),
        re100: context.re100(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants;

    const BALL_RADIUS: f32 =
        constants::STD_BALL_CIRCUMFERENCE_IN / (2.0 * constants::PI) / constants::INCHES_PER_FOOT;

    fn state(velocity: Vector3d, wind: Vector3d, spin: Vector3d) -> AerodynamicState {
        AerodynamicState {
            velocity,
            wind_velocity: wind,
            spin_vector: spin,
            ball_radius: BALL_RADIUS,
            c0: 0.005682,
            re100: 123600.0,
        }
    }

    fn assert_near(actual: f64, expected: f64, tolerance: f64) {
        assert!(
            (actual - expected).abs() < tolerance,
            "expected {expected} ± {tolerance}, got {actual}"
        );
    }

    #[test]
    fn cd_below_low_re_threshold() {
        assert_near(compute_cd(0.25, 0.0), CD_LOW as f64, 1e-6);
    }

    #[test]
    fn cd_at_low_re_threshold_is_inclusive() {
        assert_near(compute_cd(0.5, 0.0), CD_LOW as f64, 1e-6);
    }

    #[test]
    fn cd_low_re_carries_spin_term() {
        let s = 0.2;
        let expected = CD_LOW as f64 + CD_SPIN as f64 * s;
        assert_near(compute_cd(0.25, s), expected, 1e-6);
    }

    #[test]
    fn cd_is_continuous_across_low_re_threshold() {
        let s = 0.2;
        let below = compute_cd(0.5 - 1e-6, s);
        let above = compute_cd(0.5 + 1e-6, s);
        assert_near(below, above, 1e-4);
    }

    #[test]
    fn cd_mid_range() {
        let base = CD_LOW as f64 - (CD_LOW as f64 - CD_HIGH as f64) * (0.75 - 0.5) / (1.0 - 0.5);
        assert_near(compute_cd(0.75, 0.0), base, 1e-6);
        assert_near(compute_cd(0.75, 0.2), base + CD_SPIN as f64 * 0.2, 1e-6);
    }

    #[test]
    fn cd_at_and_above_high_re_threshold() {
        assert_near(compute_cd(1.0, 0.0), CD_HIGH as f64, 1e-6);
        assert_near(
            compute_cd(2.0, 0.5),
            CD_HIGH as f64 + CD_SPIN as f64 * 0.5,
            1e-6,
        );
    }

    #[test]
    fn cl_zero_spin_zero() {
        assert_near(compute_cl(0.6, 0.0), 0.0, 1e-6);
        assert_near(compute_cl(1.5, 0.0), 0.0, 1e-6);
    }

    #[test]
    fn cl_below_no_lift_re() {
        assert_near(compute_cl(0.2, 0.15), 0.0, 1e-6);
        assert_near(compute_cl(0.3, 0.25), 0.0, 1e-6);
    }

    #[test]
    fn cl_at_50k_bin_exact() {
        let s = 0.12;
        let expected = (CL_RE50K_A0 as f64
            + CL_RE50K_A1 as f64 * s
            + CL_RE50K_A2 as f64 * s * s
            + CL_RE50K_A3 as f64 * s * s * s)
            .clamp(0.0, CL_MAX_BASE as f64);
        assert_near(compute_cl(0.5, s), expected, 1e-5);
    }

    #[test]
    fn cl_between_bins_lerp() {
        let s = 0.18;
        let cl50 = CL_RE50K_A0 as f64
            + CL_RE50K_A1 as f64 * s
            + CL_RE50K_A2 as f64 * s * s
            + CL_RE50K_A3 as f64 * s * s * s;
        let cl60 = CL_RE60K_A0 as f64 + CL_RE60K_A1 as f64 * s + CL_RE60K_A2 as f64 * s * s;
        let expected = (0.5 * (cl50 + cl60)).clamp(0.0, CL_MAX_BASE as f64);
        assert_near(compute_cl(0.55, s), expected, 1e-5);
    }

    #[test]
    fn cl_high_re_hill_saturation() {
        let s = 0.20;
        let g = HIGH_RE_SPIN_GAIN as f64;
        let cl_max = CL_MAX_BASE as f64;
        let expected = (cl_max * s * g / (1.0 + s * g)).clamp(0.0, cl_max);
        assert_near(compute_cl(1.5, s), expected, 1e-6);
        assert_near(compute_cl(0.7, s), expected, 1e-6);
    }

    #[test]
    fn cl_max_lerps_at_high_spin_factor() {
        let cl_high = compute_cl(2.0, 1.0);
        assert!(cl_high > CL_MAX_BASE as f64);
        assert!(cl_high <= CL_MAX_HIGH_SR as f64 + 1e-6);
    }

    #[test]
    fn zero_velocity_returns_zero_acceleration() {
        let a = compute_acceleration(&state(
            Vector3d::ZERO,
            Vector3d::ZERO,
            Vector3d(314.16, 0.0, 0.0),
        ));
        assert!(a.0.abs() < 1e-6 && a.1.abs() < 1e-6 && a.2.abs() < 1e-6);
    }

    #[test]
    fn drag_opposes_ball_motion() {
        let a = compute_acceleration(&state(
            Vector3d(0.0, 100.0, 0.0),
            Vector3d::ZERO,
            Vector3d::ZERO,
        ));
        assert!(a.0.abs() < 1e-4);
        assert!(a.1 < 0.0);
        assert!(a.2.abs() < 1e-4);
    }

    #[test]
    fn backspin_produces_upward_magnus_force() {
        let a = compute_acceleration(&state(
            Vector3d(0.0, 100.0, 0.0),
            Vector3d::ZERO,
            Vector3d(314.16, 0.0, 0.0),
        ));
        assert!(a.1 < 0.0);
        assert!(a.2 > 0.0);
    }

    #[test]
    fn tailwind_reduces_effective_drag() {
        let no_wind = compute_acceleration(&state(
            Vector3d(0.0, 100.0, 0.0),
            Vector3d::ZERO,
            Vector3d::ZERO,
        ));
        let tail_wind = compute_acceleration(&state(
            Vector3d(0.0, 100.0, 0.0),
            Vector3d(0.0, 30.0, 0.0),
            Vector3d::ZERO,
        ));
        assert!(tail_wind.1 > no_wind.1);
    }
}
