//! Rolling-friction model for the ball after the bounce phase.

use crate::constants;
use crate::data::GroundSurface;
use crate::vector::Vector3d;

/// State at the start of one roll step.
pub struct RollState {
    /// Position in feet.
    pub position: Vector3d,
    /// Velocity in ft/s.
    pub velocity: Vector3d,
    /// Spin vector in rad/s.
    pub spin_vector: Vector3d,
    /// Unit surface normal (upward on flat ground).
    pub surface_normal: Vector3d,
    /// Time step in seconds.
    pub dt: f32,
}

/// Result of one roll step.
pub struct RollResult {
    /// Position after the step, in feet.
    pub new_position: Vector3d,
    /// Velocity after the step, in ft/s.
    pub new_velocity: Vector3d,
    /// Spin vector after the step, in rad/s (decayed).
    pub new_spin_vector: Vector3d,
    /// True when the ball has stopped.
    pub at_rest: bool,
}

const STOPPING_VELOCITY: f32 = 0.1;
const SPIN_DECAY_RATE: f32 = 2.0;

/// Advances the ball by one roll step; returns the new state and whether the
/// ball has come to rest.
pub fn roll_step(state: &RollState, surface: &GroundSurface) -> RollResult {
    let dt = state.dt;

    let accel = compute_acceleration(state.velocity, state.surface_normal, surface);

    let old_vel_x = state.velocity.0;
    let old_vel_y = state.velocity.1;

    let mut new_vel = state.velocity + accel * dt;

    if old_vel_x.abs() > STOPPING_VELOCITY && old_vel_x * new_vel.0 < 0.0 {
        new_vel.0 = 0.0;
    }
    if old_vel_y.abs() > STOPPING_VELOCITY && old_vel_y * new_vel.1 < 0.0 {
        new_vel.1 = 0.0;
    }

    let new_pos = Vector3d(
        state.position.0 + new_vel.0 * dt,
        state.position.1 + new_vel.1 * dt,
        state.position.2,
    );
    new_vel.2 = 0.0;

    let spin_mag = state.spin_vector.magnitude();
    let decay = SPIN_DECAY_RATE * dt;
    let new_spin = if spin_mag > decay {
        state.spin_vector * ((spin_mag - decay) / spin_mag)
    } else {
        Vector3d::ZERO
    };

    let old_horizontal = (old_vel_x * old_vel_x + old_vel_y * old_vel_y).sqrt();
    let v_horizontal = (new_vel.0 * new_vel.0 + new_vel.1 * new_vel.1).sqrt();
    let at_rest = v_horizontal < STOPPING_VELOCITY && v_horizontal <= old_horizontal;

    RollResult {
        new_position: new_pos,
        new_velocity: new_vel,
        new_spin_vector: new_spin,
        at_rest,
    }
}

fn compute_acceleration(
    velocity: Vector3d,
    surface_normal: Vector3d,
    surface: &GroundSurface,
) -> Vector3d {
    let v_horizontal = (velocity.0 * velocity.0 + velocity.1 * velocity.1).sqrt();

    if v_horizontal < constants::MIN_SPEED {
        return Vector3d::ZERO;
    }

    let cos_theta = surface_normal.2;

    if cos_theta > constants::FLAT_SURFACE_THRESHOLD {
        let deceleration = surface.friction_dynamic * constants::GRAVITY_FT_PER_S2;
        return Vector3d(
            -deceleration * (velocity.0 / v_horizontal),
            -deceleration * (velocity.1 / v_horizontal),
            0.0,
        );
    }

    let gravity = Vector3d(0.0, 0.0, -constants::GRAVITY_FT_PER_S2);

    let gravity_dot_normal = gravity.dot(surface_normal);
    let gravity_normal = surface_normal * gravity_dot_normal;
    let mut acceleration = gravity - gravity_normal;

    let normal_force = gravity_dot_normal.abs();
    let friction_deceleration = surface.friction_dynamic * normal_force;

    acceleration.0 -= friction_deceleration * (velocity.0 / v_horizontal);
    acceleration.1 -= friction_deceleration * (velocity.1 / v_horizontal);

    acceleration
}
