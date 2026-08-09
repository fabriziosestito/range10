use crate::golf::aero::{self, AerodynamicState};
use crate::golf::bounce;
use crate::golf::constants;
use crate::golf::data::{
    AtmosphericData, BallProperties, BallState, GroundSurface, LaunchData, ShotPhysicsContext,
};
use crate::golf::roll;
use crate::golf::vector::{self, Vector3d};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Phase {
    Aerial,
    Bounce,
    Roll,
    Complete,
}

impl Phase {
    pub fn name(self) -> &'static str {
        match self {
            Phase::Aerial => "aerial",
            Phase::Bounce => "bounce",
            Phase::Roll => "roll",
            Phase::Complete => "complete",
        }
    }
}

#[derive(Debug)]
pub enum SimError {
    NonPositiveDt(f32),
    DidNotConverge(Phase),
}

impl std::fmt::Display for SimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SimError::NonPositiveDt(dt) => {
                write!(f, "FlightSimulator: dt must be positive (got {dt})")
            }
            SimError::DidNotConverge(phase) => write!(
                f,
                "FlightSimulator did not converge within {}s (stuck in {} phase)",
                constants::MAX_SIMULATION_TIME,
                phase.name()
            ),
        }
    }
}

impl std::error::Error for SimError {}

pub struct Simulator {
    current_phase: Phase,
    state: BallState,
    start_position: Vector3d,
    gravity: f32,
    context: ShotPhysicsContext,
    ground: GroundSurface,
    ball_radius: f32,
    at_rest: bool,
    v: f32,
    tau: f32,
    vw: f32,
}

impl Simulator {
    pub fn new(
        launch: LaunchData,
        atmos: AtmosphericData,
        ground: GroundSurface,
        ball: BallProperties,
        gravity: f32,
    ) -> Self {
        let context = ShotPhysicsContext::new(launch, atmos, ball);
        let ball_radius = ball.radius_ft();
        let mut sim = Self {
            current_phase: Phase::Aerial,
            state: BallState::default(),
            start_position: Vector3d(launch.start_x, launch.start_y, launch.start_z),
            gravity,
            context,
            ground,
            ball_radius,
            at_rest: false,
            v: 0.0,
            tau: 0.0,
            vw: 0.0,
        };
        sim.initialize_from_launch(launch);
        sim
    }

    fn initialize_from_launch(&mut self, launch: LaunchData) {
        let v0_fps = launch.ball_speed_mph * constants::MPH_TO_FT_PER_S;
        self.state = BallState::from_launch_parameters(
            v0_fps,
            launch.launch_angle_deg,
            launch.direction_deg,
            self.start_position,
            self.gravity,
            self.context.w(),
        );
        self.aerial_initialize();
    }

    #[expect(dead_code)]
    pub fn run(&mut self, dt: f32) -> Result<(), SimError> {
        let max_steps = convergence_step_cap(dt)?;

        let mut step = 0i64;
        while self.current_phase != Phase::Complete {
            if step >= max_steps {
                return Err(SimError::DidNotConverge(self.current_phase));
            }
            self.step_once(dt);
            step += 1;
        }
        Ok(())
    }

    pub fn run_and_get_trajectory(&mut self, dt: f32) -> Result<Vec<BallState>, SimError> {
        let max_steps = convergence_step_cap(dt)?;

        let mut trajectory = Vec::with_capacity((10.0 / dt) as usize);
        let mut step = 0i64;
        while self.current_phase != Phase::Complete {
            if step >= max_steps {
                return Err(SimError::DidNotConverge(self.current_phase));
            }
            trajectory.push(self.state);
            self.step_once(dt);
            step += 1;
        }
        trajectory.push(self.state);

        Ok(trajectory)
    }

    #[expect(dead_code)]
    pub fn state(&self) -> &BallState {
        &self.state
    }

    #[expect(dead_code)]
    pub fn current_phase(&self) -> Phase {
        self.current_phase
    }

    pub fn landing_result(&self) -> LandingResult {
        let relative = self.state.position - self.start_position;
        LandingResult {
            x_yards: relative.0 / constants::YARDS_TO_FEET,
            y_yards: relative.1 / constants::YARDS_TO_FEET,
            z_yards: relative.2 / constants::YARDS_TO_FEET,
            time_of_flight: self.state.current_time,
            bearing_deg: relative.0.atan2(relative.1) * 180.0 / constants::PI,
            distance: vector::distance_in_yards(relative),
        }
    }

    fn step_once(&mut self, dt: f32) {
        match self.current_phase {
            Phase::Aerial => self.aerial_step(dt),
            Phase::Bounce => self.bounce_step(dt),
            Phase::Roll => self.roll_step(dt),
            Phase::Complete => {}
        }
        self.check_phase_transition();
    }

    fn check_phase_transition(&mut self) {
        match self.current_phase {
            Phase::Aerial => {
                if self.aerial_is_complete() {
                    self.current_phase = Phase::Bounce;
                }
            }
            Phase::Bounce => {
                if self.bounce_is_complete() {
                    self.current_phase = Phase::Roll;
                }
            }
            Phase::Roll => {
                if self.at_rest {
                    self.current_phase = Phase::Complete;
                }
            }
            Phase::Complete => {}
        }
    }

    fn aerial_initialize(&mut self) {
        if self.state.spin_vector.magnitude() < constants::MIN_SPIN {
            self.state.spin_vector = self.context.w();
        }

        self.v = self.state.velocity.magnitude();

        self.aerial_calculate_velocityw();
        self.aerial_calculate_tau();
        self.aerial_calculate_accel();
    }

    fn aerial_step(&mut self, dt: f32) {
        self.aerial_calculate_tau();
        let decay = (-dt / self.tau).exp();
        self.state.spin_vector.0 *= decay;
        self.state.spin_vector.1 *= decay;
        self.state.spin_vector.2 *= decay;

        integrate_step(&mut self.state, dt);

        self.state.current_time += dt;

        self.v = self.state.velocity.magnitude();
        self.aerial_calculate_velocityw();
        self.aerial_calculate_accel();
    }

    fn aerial_is_complete(&self) -> bool {
        self.state.position.2 <= self.ground.height
    }

    fn aerial_calculate_velocityw(&mut self) {
        if self.state.position.2 >= self.context.height_wind() {
            let vw = self.context.vw();
            self.vw = ((self.state.velocity.0 - vw.0).powi(2)
                + (self.state.velocity.1 - vw.1).powi(2)
                + self.state.velocity.2.powi(2))
            .sqrt();
        } else {
            self.vw = self.v;
        }
    }

    fn aerial_calculate_tau(&mut self) {
        if self.v < constants::MIN_SPEED {
            self.tau = 1e6;
            return;
        }
        self.tau = aero::spin_decay_tau(&self.build_aero_state());
    }

    fn aerial_calculate_accel(&mut self) {
        self.state.acceleration = self.flight_acceleration();
    }

    fn bounce_step(&mut self, dt: f32) {
        let surface_normal = self.surface_normal();
        let velocity_dot_normal = self.state.velocity.dot(surface_normal);

        if self.state.position.2 <= self.ground.height && velocity_dot_normal < 0.0 {
            let result = bounce::resolve_bounce(
                &bounce::BounceState {
                    velocity: self.state.velocity,
                    surface_normal,
                    spin_vector: self.state.spin_vector,
                    ball_radius: self.ball_radius,
                },
                &self.ground,
            );
            self.state.velocity = result.new_velocity;
            self.state.spin_vector = result.new_spin_vector;
            self.state.position.2 = self.ground.height;
        }

        self.state.acceleration = self.flight_acceleration();

        integrate_step(&mut self.state, dt);

        self.state.current_time += dt;

        if self.state.position.2 < self.ground.height {
            self.state.position.2 = self.ground.height;
        }
    }

    fn bounce_is_complete(&self) -> bool {
        let height_above_ground = self.state.position.2 - self.ground.height;
        if height_above_ground > constants::GROUND_CONTACT_THRESHOLD {
            return false;
        }
        self.state.velocity.dot(self.surface_normal()).abs() < constants::MIN_BOUNCE_VELOCITY
    }

    fn roll_step(&mut self, dt: f32) {
        let result = roll::roll_step(
            &roll::RollState {
                position: self.state.position,
                velocity: self.state.velocity,
                spin_vector: self.state.spin_vector,
                surface_normal: self.surface_normal(),
                dt,
            },
            &self.ground,
        );

        self.state.position = result.new_position;
        self.state.velocity = result.new_velocity;
        self.state.spin_vector = result.new_spin_vector;

        self.state.position.2 = self.ground.height;
        self.state.velocity.2 = 0.0;

        self.state.current_time += dt;
        self.at_rest = result.at_rest;
    }

    fn flight_acceleration(&self) -> Vector3d {
        let aero = aero::compute_acceleration(&self.build_aero_state());
        Vector3d(aero.0, aero.1, aero.2 - self.gravity)
    }

    fn build_aero_state(&self) -> AerodynamicState {
        aero::build_state(&self.state, &self.context, self.ball_radius)
    }

    fn surface_normal(&self) -> Vector3d {
        Vector3d(0.0, 0.0, 1.0)
    }
}

fn integrate_step(state: &mut BallState, dt: f32) {
    let a = state.acceleration;
    state.position.0 += state.velocity.0 * dt + constants::HALF * a.0 * dt * dt;
    state.position.1 += state.velocity.1 * dt + constants::HALF * a.1 * dt * dt;
    state.position.2 += state.velocity.2 * dt + constants::HALF * a.2 * dt * dt;
    state.velocity.0 += a.0 * dt;
    state.velocity.1 += a.1 * dt;
    state.velocity.2 += a.2 * dt;
}

fn convergence_step_cap(dt: f32) -> Result<i64, SimError> {
    if !dt.partial_cmp(&0.0).is_some_and(std::cmp::Ordering::is_gt) {
        return Err(SimError::NonPositiveDt(dt));
    }
    Ok((constants::MAX_SIMULATION_TIME / dt) as i64)
}

#[derive(Debug, Clone, Copy)]
pub struct LandingResult {
    pub x_yards: f32,
    pub y_yards: f32,
    #[expect(dead_code)]
    pub z_yards: f32,
    pub time_of_flight: f32,
    pub bearing_deg: f32,
    #[expect(dead_code)]
    pub distance: f32,
}

#[derive(Debug, Clone, Default)]
pub struct ShotResult {
    #[expect(dead_code)]
    pub trajectory: Vec<f32>,
    #[expect(dead_code)]
    pub carry_index: usize,
    pub carry_yards: f32,
    pub total_yards: f32,
    pub apex_yards: f32,
    pub offline_yards: f32,
    pub time_of_flight: f32,
    #[expect(dead_code)]
    pub bearing_deg: f32,
}

pub fn run_shot(
    launch: LaunchData,
    atmos: AtmosphericData,
    ground: GroundSurface,
) -> Result<ShotResult, SimError> {
    let mut sim = Simulator::new(
        launch,
        atmos,
        ground,
        BallProperties::default(),
        constants::GRAVITY_FT_PER_S2,
    );
    let trajectory = sim.run_and_get_trajectory(constants::SIMULATION_TIME_STEP)?;
    let landing = sim.landing_result();

    let mut trajectory_yards = Vec::with_capacity(trajectory.len() * 3);
    let mut apex_idx = 0usize;
    let mut apex_ft = 0.0f32;
    for (i, state) in trajectory.iter().enumerate() {
        let p = state.position;
        trajectory_yards.push(p.0 / constants::YARDS_TO_FEET);
        trajectory_yards.push(p.1 / constants::YARDS_TO_FEET);
        trajectory_yards.push(p.2 / constants::YARDS_TO_FEET);
        if i == 0 || p.2 > apex_ft {
            apex_ft = p.2;
            apex_idx = i;
        }
    }

    let ground_ft = ground.height + 0.05;
    let mut carry_idx = trajectory.len() - 1;
    for (i, state) in trajectory.iter().enumerate().skip(apex_idx) {
        if state.position.2 <= ground_ft {
            carry_idx = i;
            break;
        }
    }

    Ok(ShotResult {
        trajectory: trajectory_yards,
        carry_index: carry_idx,
        carry_yards: trajectory[carry_idx].position.1 / constants::YARDS_TO_FEET,
        total_yards: landing.y_yards,
        apex_yards: apex_ft.max(0.0) / constants::YARDS_TO_FEET,
        offline_yards: landing.x_yards,
        time_of_flight: landing.time_of_flight,
        bearing_deg: landing.bearing_deg,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn atmos(temp_f: f32, elevation_ft: f32, wind_mph: f32, wind_dir_deg: f32) -> AtmosphericData {
        AtmosphericData {
            temp_f,
            elevation_ft,
            wind_mph,
            wind_direction_deg: wind_dir_deg,
            wind_height_ft: 0.0,
            rel_humidity: 50.0,
            pressure_inhg: 29.92,
        }
    }

    #[test]
    fn reference_driver() {
        let result = run_shot(
            LaunchData {
                ball_speed_mph: 160.0,
                launch_angle_deg: 11.0,
                direction_deg: 0.0,
                backspin_rpm: 3000.0,
                sidespin_rpm: 0.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((result.carry_yards - 259.40).abs() < 0.05);
        assert!((result.total_yards - 264.73).abs() < 0.05);
        assert!((result.apex_yards - 31.88).abs() < 0.05);
        assert!((result.offline_yards - 0.00).abs() < 0.05);
        assert!((result.time_of_flight - 9.010).abs() < 0.01);
    }

    #[test]
    fn reference_iron_and_wedge() {
        let seven = run_shot(
            LaunchData {
                ball_speed_mph: 120.0,
                launch_angle_deg: 20.0,
                backspin_rpm: 6500.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((seven.carry_yards - 174.26).abs() < 0.05);
        assert!((seven.apex_yards - 32.57).abs() < 0.05);

        let wedge = run_shot(
            LaunchData {
                ball_speed_mph: 90.0,
                launch_angle_deg: 40.0,
                backspin_rpm: 9000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((wedge.carry_yards - 95.33).abs() < 0.05);
        assert!((wedge.total_yards - 93.29).abs() < 0.05);
    }

    #[test]
    fn reference_lateral_direction() {
        let slice = run_shot(
            LaunchData {
                ball_speed_mph: 150.0,
                launch_angle_deg: 12.0,
                direction_deg: -3.0,
                backspin_rpm: 2800.0,
                sidespin_rpm: 600.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((slice.offline_yards - -32.35).abs() < 0.05);
        assert!((slice.carry_yards - 236.34).abs() < 0.05);

        let hook = run_shot(
            LaunchData {
                ball_speed_mph: 150.0,
                launch_angle_deg: 12.0,
                direction_deg: 3.0,
                backspin_rpm: 2800.0,
                sidespin_rpm: -600.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((hook.offline_yards - 32.35).abs() < 0.05);
    }

    #[test]
    fn reference_wind_and_elevation() {
        let tailwind = run_shot(
            LaunchData {
                ball_speed_mph: 160.0,
                launch_angle_deg: 11.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 15.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((tailwind.carry_yards - 274.73).abs() < 0.05);
        assert!((tailwind.apex_yards - 27.10).abs() < 0.05);

        let headwind = run_shot(
            LaunchData {
                ball_speed_mph: 160.0,
                launch_angle_deg: 11.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 15.0, 180.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((headwind.carry_yards - 233.65).abs() < 0.05);

        let high = run_shot(
            LaunchData {
                ball_speed_mph: 160.0,
                launch_angle_deg: 11.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 5000.0, 0.0, 0.0),
            GroundSurface::default(),
        )
        .unwrap();
        assert!((high.carry_yards - 263.26).abs() < 0.05);
    }

    #[test]
    fn runs_through_all_phases() {
        let mut sim = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        assert_eq!(sim.current_phase(), Phase::Aerial);
        sim.run(0.01).unwrap();
        assert_eq!(sim.current_phase(), Phase::Complete);
        assert!((sim.state().position.2 - 0.0).abs() < 0.1);
        assert!(sim.state().position.1 > 10.0);
    }

    #[test]
    fn produces_reasonable_trajectory() {
        let mut sim = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        let trajectory = sim.run_and_get_trajectory(0.01).unwrap();

        let max_height = trajectory
            .iter()
            .map(|s| s.position.2)
            .fold(0.0f32, f32::max);
        let final_state = trajectory.last().unwrap();
        let final_distance = (final_state.position.0 * final_state.position.0
            + final_state.position.1 * final_state.position.1)
            .sqrt();

        assert!(max_height > 10.0 && max_height < 120.0);
        assert!(final_distance > 100.0 && final_distance < 1000.0);
        assert!((final_state.position.2 - 0.0).abs() < 0.1);
    }

    #[test]
    fn run_is_idempotent() {
        let mut sim = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        sim.run(0.01).unwrap();
        let before = *sim.state();
        sim.run(0.01).unwrap();
        assert_eq!(before.position, sim.state().position);
        assert_eq!(before.current_time, sim.state().current_time);
    }

    #[test]
    fn handles_nonzero_ground_height() {
        let ground = GroundSurface {
            height: 10.0,
            ..Default::default()
        };
        let mut sim = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                start_z: ground.height,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            ground,
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        sim.run(0.01).unwrap();
        assert!((sim.state().position.2 - 10.0).abs() < 0.1);
        let final_speed = sim.state().velocity.magnitude();
        assert!(final_speed < 1.0);
    }

    #[test]
    fn spin_decays_across_all_phases() {
        let mut sim = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        let trajectory = sim.run_and_get_trajectory(0.01).unwrap();
        let initial_spin = trajectory.first().unwrap().spin_vector.magnitude();
        let final_spin = trajectory.last().unwrap().spin_vector.magnitude();
        assert!(initial_spin > 0.0);
        assert!(final_spin <= initial_spin);
    }

    #[test]
    fn landing_result_is_relative_to_nonzero_start() {
        let mut at_origin = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        at_origin.run(0.01).unwrap();
        let base = at_origin.landing_result();

        let mut shifted = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                start_x: 30.0,
                start_y: 150.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        shifted.run(0.01).unwrap();
        let moved = shifted.landing_result();

        assert!((moved.x_yards - base.x_yards).abs() < 0.01);
        assert!((moved.y_yards - base.y_yards).abs() < 0.01);
        assert!((moved.distance - base.distance).abs() < 0.01);
        assert!((moved.bearing_deg - base.bearing_deg).abs() < 0.01);

        let abs_pos = shifted.state().position;
        assert!((abs_pos.0 / constants::YARDS_TO_FEET - (base.x_yards + 10.0)).abs() < 0.05);
        assert!((abs_pos.1 / constants::YARDS_TO_FEET - (base.y_yards + 50.0)).abs() < 0.05);
    }

    #[test]
    fn rejects_non_positive_dt() {
        let mut sim = Simulator::new(
            LaunchData {
                ball_speed_mph: 100.0,
                launch_angle_deg: 30.0,
                backspin_rpm: 3000.0,
                ..Default::default()
            },
            atmos(70.0, 0.0, 0.0, 0.0),
            GroundSurface::default(),
            BallProperties::default(),
            constants::GRAVITY_FT_PER_S2,
        );
        assert!(matches!(sim.run(0.0), Err(SimError::NonPositiveDt(_))));
        assert!(matches!(sim.run(-0.01), Err(SimError::NonPositiveDt(_))));
    }
}
