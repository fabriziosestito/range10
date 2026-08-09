//! Ball–ground bounce model.
//!
//! Resolves impact velocity into normal and tangential components: the
//! normal component reflects with an effective coefficient of restitution
//! that degrades with spin and impact speed; the tangential component either
//! retains energy with spin-back ("bite") on steep, fast impacts or is
//! damped by friction otherwise.

use crate::constants;
use crate::data::GroundSurface;
use crate::vector::Vector3d;

/// State at the moment of ground contact.
pub struct BounceState {
    /// Impact velocity in ft/s.
    pub velocity: Vector3d,
    /// Unit surface normal (upward on flat ground).
    pub surface_normal: Vector3d,
    /// Spin vector in rad/s.
    pub spin_vector: Vector3d,
    /// Ball radius in feet.
    pub ball_radius: f32,
}

/// Post-bounce state.
pub struct BounceResult {
    /// Velocity after the bounce, in ft/s.
    pub new_velocity: Vector3d,
    /// Spin vector after the bounce, in rad/s.
    pub new_spin_vector: Vector3d,
}

const MIN_PENNER_BOUNCE_SPEED_FT_PER_S: f32 = 20.0 * constants::METERS_TO_FEET;
const BOUNCE_COR_SPIN_KNEE_RPM: f32 = 1500.0;
const BOUNCE_COR_SPIN_HIGH_BAND_RPM: f32 = 1500.0;
const BOUNCE_COR_SPIN_LOW_MAX_REDUCTION: f32 = 0.30;
const BOUNCE_COR_SPIN_HIGH_MAX_REDUCTION: f32 = 0.70;
const BOUNCE_COR_VEL_LOW_MS: f32 = 12.0;
const BOUNCE_COR_VEL_MID_SCALE: f32 = 0.50;
const BOUNCE_COR_VEL_HIGH_MS: f32 = 25.0;
const BOUNCE_RETENTION_BASE: f32 = 0.55;
const BOUNCE_RETENTION_RPM_NORM: f32 = 8000.0;
const BOUNCE_RETENTION_FLOOR: f32 = 0.40;

/// Resolves one bounce against the surface.
pub fn resolve_bounce(state: &BounceState, surface: &GroundSurface) -> BounceResult {
    let v_dot_n = state.velocity.dot(state.surface_normal);

    let v_normal = state.surface_normal * v_dot_n;
    let v_tangent = state.velocity - v_normal;

    let tangent_mag = v_tangent.magnitude();
    let impact_speed = state.velocity.magnitude();
    let omega_mag = state.spin_vector.magnitude();

    let spin_rpm = omega_mag / constants::RPM_TO_RAD_PER_S;
    let speed_normal_ms = v_dot_n.abs() * constants::FEET_TO_METERS;

    let effective_cor = surface.restitution
        * (1.0 - cor_max_reduction(spin_rpm) * cor_velocity_scale(speed_normal_ms));

    let v_normal_after = v_normal * -effective_cor;

    let mut impact_angle = 0.0;
    if impact_speed > constants::MIN_SPEED {
        let sin_angle = (-v_dot_n / impact_speed).clamp(-1.0, 1.0);
        impact_angle = sin_angle.asin();
    }

    let steep_impact = impact_angle >= surface.critical_angle;
    let energetic_impact = impact_speed >= MIN_PENNER_BOUNCE_SPEED_FT_PER_S;

    let v_tangent_after = if steep_impact && energetic_impact && tangent_mag > constants::MIN_SPEED
    {
        let t_hat = v_tangent * (1.0 / tangent_mag);
        let lateral_axis = t_hat.cross(state.surface_normal);
        let backspin_scalar = state.spin_vector.dot(lateral_axis);

        let retention = BOUNCE_RETENTION_BASE
            * (1.0 - spin_rpm / BOUNCE_RETENTION_RPM_NORM).clamp(BOUNCE_RETENTION_FLOOR, 1.0);
        let spinback_term = (2.0 * state.ball_radius * backspin_scalar) / 7.0;
        let new_tangent_speed =
            retention * impact_speed * (impact_angle - surface.critical_angle).sin()
                - spinback_term;

        v_tangent * (new_tangent_speed / tangent_mag)
    } else {
        let mut friction_factor = 1.0 - surface.friction_static * (1.0 - surface.firmness);
        friction_factor = friction_factor.clamp(0.0, 1.0);
        v_tangent * friction_factor
    };

    BounceResult {
        new_velocity: v_normal_after + v_tangent_after,
        new_spin_vector: state.spin_vector * surface.spin_retention,
    }
}

fn cor_velocity_scale(speed_normal_ms: f32) -> f32 {
    if speed_normal_ms < BOUNCE_COR_VEL_LOW_MS {
        BOUNCE_COR_VEL_MID_SCALE * (speed_normal_ms / BOUNCE_COR_VEL_LOW_MS)
    } else if speed_normal_ms < BOUNCE_COR_VEL_HIGH_MS {
        let t = (speed_normal_ms - BOUNCE_COR_VEL_LOW_MS)
            / (BOUNCE_COR_VEL_HIGH_MS - BOUNCE_COR_VEL_LOW_MS);
        BOUNCE_COR_VEL_MID_SCALE + (1.0 - BOUNCE_COR_VEL_MID_SCALE) * t
    } else {
        1.0
    }
}

fn cor_max_reduction(spin_rpm: f32) -> f32 {
    if spin_rpm < BOUNCE_COR_SPIN_KNEE_RPM {
        (spin_rpm / BOUNCE_COR_SPIN_KNEE_RPM) * BOUNCE_COR_SPIN_LOW_MAX_REDUCTION
    } else {
        let excess = spin_rpm - BOUNCE_COR_SPIN_KNEE_RPM;
        let t = (excess / BOUNCE_COR_SPIN_HIGH_BAND_RPM).min(1.0);
        BOUNCE_COR_SPIN_LOW_MAX_REDUCTION
            + (BOUNCE_COR_SPIN_HIGH_MAX_REDUCTION - BOUNCE_COR_SPIN_LOW_MAX_REDUCTION) * t
    }
}
