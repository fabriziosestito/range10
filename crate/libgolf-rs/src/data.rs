//! Inputs to the flight simulation: launch conditions, atmosphere, ball and
//! ground properties, plus the per-shot derived physics context.

use crate::constants;
use crate::vector::{self, Vector3d};

/// Launch conditions of a shot.
///
/// Angles follow the libgolf convention: `launch_angle_deg` is elevation
/// (positive = up), `direction_deg` is the horizontal launch direction
/// (positive = right of the target line). Spin components are the
/// backspin/sidespin decomposition of the total spin.
#[derive(Debug, Clone, Copy)]
pub struct LaunchData {
    /// Initial ball speed in miles per hour.
    pub ball_speed_mph: f32,
    /// Launch angle above horizontal, in degrees.
    pub launch_angle_deg: f32,
    /// Horizontal launch direction relative to the target line, in degrees
    /// (positive = right).
    pub direction_deg: f32,
    /// Backspin in revolutions per minute.
    pub backspin_rpm: f32,
    /// Sidespin in revolutions per minute.
    pub sidespin_rpm: f32,
    /// Start position x (lateral, feet).
    pub start_x: f32,
    /// Start position y (downrange, feet).
    pub start_y: f32,
    /// Start position z (height above ground, feet).
    pub start_z: f32,
}

impl Default for LaunchData {
    fn default() -> Self {
        Self {
            ball_speed_mph: 0.0,
            launch_angle_deg: 0.0,
            direction_deg: 0.0,
            backspin_rpm: 0.0,
            sidespin_rpm: 0.0,
            start_x: 0.0,
            start_y: 0.0,
            start_z: 0.0,
        }
    }
}

/// Atmospheric conditions at the range.
///
/// `wind_direction_deg` is the direction the wind is blowing toward
/// (positive = right of the target line), so a tailwind is 0°.
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct AtmosphericData {
    /// Air temperature in degrees Fahrenheit.
    pub temp_f: f32,
    /// Range elevation in feet above sea level.
    pub elevation_ft: f32,
    /// Wind speed in miles per hour.
    pub wind_mph: f32,
    /// Wind direction in degrees (0° = blowing downrange).
    pub wind_direction_deg: f32,
    /// Height in feet at which wind takes effect.
    pub wind_height_ft: f32,
    /// Relative humidity in percent.
    pub rel_humidity: f32,
    /// Barometric pressure in inches of mercury.
    pub pressure_inhg: f32,
}

impl Default for AtmosphericData {
    fn default() -> Self {
        Self {
            temp_f: 59.0,
            elevation_ft: 0.0,
            wind_mph: 0.0,
            wind_direction_deg: 0.0,
            wind_height_ft: 0.0,
            rel_humidity: 0.0,
            pressure_inhg: 29.92,
        }
    }
}

/// Physical properties of the golf ball.
#[derive(Debug, Clone, Copy)]
pub struct BallProperties {
    /// Ball mass in ounces.
    pub mass_oz: f32,
    /// Ball circumference in inches.
    pub circumference_in: f32,
}

impl Default for BallProperties {
    fn default() -> Self {
        Self {
            mass_oz: constants::STD_BALL_MASS_OZ,
            circumference_in: constants::STD_BALL_CIRCUMFERENCE_IN,
        }
    }
}

impl BallProperties {
    /// Ball radius in feet.
    pub fn radius_ft(&self) -> f32 {
        self.circumference_in / (2.0 * constants::PI) / constants::INCHES_PER_FOOT
    }
}

/// Ground surface at and beyond the landing zone.
///
/// The default is a typical fairway: moderate restitution and firmness,
/// 15° critical angle.
#[derive(Debug, Clone, Copy)]
pub struct GroundSurface {
    /// Ground height relative to the launch origin, in feet.
    pub height: f32,
    /// Coefficient of restitution of the surface (0–1).
    pub restitution: f32,
    /// Static friction coefficient used to slow the ball at low angles.
    pub friction_static: f32,
    /// Dynamic (rolling) friction coefficient.
    pub friction_dynamic: f32,
    /// Surface firmness (0–1): soft surfaces slow the ball more.
    pub firmness: f32,
    /// Fraction of spin retained after a bounce.
    pub spin_retention: f32,
    /// Impact angle (radians) above which the ball "bites" (spin-back model).
    pub critical_angle: f32,
}

impl Default for GroundSurface {
    fn default() -> Self {
        Self {
            height: 0.0,
            restitution: 0.4,
            friction_static: 0.5,
            friction_dynamic: 0.2,
            firmness: 0.8,
            spin_retention: 0.75,
            critical_angle: 15.0 * constants::DEG_TO_RAD,
        }
    }
}

/// Full state of the ball at a point in time (feet, ft/s).
#[derive(Debug, Clone, Copy)]
pub struct BallState {
    /// Position in feet.
    pub position: Vector3d,
    /// Velocity in feet per second.
    pub velocity: Vector3d,
    /// Current acceleration in ft/s².
    pub acceleration: Vector3d,
    /// Elapsed simulation time in seconds.
    pub current_time: f32,
    /// Spin vector in rad/s.
    pub spin_vector: Vector3d,
}

impl Default for BallState {
    fn default() -> Self {
        Self {
            position: Vector3d::ZERO,
            velocity: Vector3d::ZERO,
            acceleration: Vector3d::ZERO,
            current_time: 0.0,
            spin_vector: Vector3d::ZERO,
        }
    }
}

impl BallState {
    /// Builds an initial state from launch parameters.
    ///
    /// `direction_deg` follows the same convention as [`LaunchData`]:
    /// positive = right of the target line. `gravity` is in ft/s² and is
    /// applied as an initial downward acceleration.
    pub fn from_launch_parameters(
        speed_fps: f32,
        launch_angle_deg: f32,
        direction_deg: f32,
        start_pos: Vector3d,
        gravity: f32,
        initial_spin_vector: Vector3d,
    ) -> BallState {
        let theta_rad = launch_angle_deg * constants::DEG_TO_RAD;
        let phi_rad = direction_deg * constants::DEG_TO_RAD;

        let velocity = Vector3d(
            speed_fps * theta_rad.cos() * phi_rad.sin(),
            speed_fps * theta_rad.cos() * phi_rad.cos(),
            speed_fps * theta_rad.sin(),
        );

        BallState {
            position: start_pos,
            velocity,
            acceleration: Vector3d(0.0, 0.0, -gravity),
            current_time: 0.0,
            spin_vector: initial_spin_vector,
        }
    }
}

/// Derived air, spin, and ball quantities used by the flight models.
///
/// Computed once per shot from the launch, atmosphere, and ball properties
/// (see [`ShotPhysicsContext::new`]) and shared across the trajectory.
pub struct ShotPhysicsContext {
    atmos: AtmosphericData,
    rho_metric: f32,
    c0: f32,
    temp_c: f32,
    v0: Vector3d,
    w: Vector3d,
    vw: Vector3d,
    omega: f32,
    r_omega: f32,
    barometric_pressure: f32,
    re100: f32,
    air_viscosity: f32,
}

impl ShotPhysicsContext {
    /// Derives all per-shot quantities from the raw inputs.
    ///
    /// Computes air density (temperature, elevation, humidity, pressure),
    /// the drag coefficient scale `c0`, initial velocity and spin vectors,
    /// and the Reynolds number at 100 mph used by the aerodynamic model.
    pub fn new(launch: LaunchData, atmos: AtmosphericData, ball: BallProperties) -> Self {
        let temp_c = vector::fahrenheit_to_celsius(atmos.temp_f);
        let elevation_m = vector::feet_to_meters(atmos.elevation_ft);

        let barometric_pressure = atmos.pressure_inhg * constants::INHG_TO_MMHG;
        let svp = constants::SVP_COEFF_A
            * ((constants::SVP_COEFF_B - temp_c / constants::SVP_COEFF_C) * temp_c
                / (constants::SVP_COEFF_D + temp_c))
                .exp();
        let omega = (launch.backspin_rpm * launch.backspin_rpm
            + launch.sidespin_rpm * launch.sidespin_rpm)
            .sqrt()
            * constants::RPM_TO_RAD_PER_S;
        let r_omega =
            (ball.circumference_in / (2.0 * constants::PI)) * (omega / constants::INCHES_PER_FOOT);

        let temp_kelvin = vector::celsius_to_kelvin(temp_c);
        let rho_metric = constants::STD_AIR_DENSITY_KG_PER_M3
            * ((constants::KELVIN_OFFSET / temp_kelvin)
                * ((barometric_pressure * (-constants::BETA_PRESSURE_DECAY * elevation_m).exp()
                    - constants::WATER_VAPOR_COEFF * atmos.rel_humidity * (svp / 100.0))
                    / constants::STD_PRESSURE_MMHG));
        let rho_imperial = rho_metric * constants::KG_PER_M3_TO_LB_PER_FT3;
        let c0 = constants::DRAG_FORCE_CONST
            * rho_imperial
            * (constants::REF_BALL_MASS_OZ / ball.mass_oz)
            * (ball.circumference_in / constants::REF_BALL_CIRC_IN).powi(2);

        let v0_magnitude = launch.ball_speed_mph * constants::MPH_TO_FT_PER_S;
        let v0 = Vector3d(
            v0_magnitude
                * (launch.launch_angle_deg * constants::DEG_TO_RAD).cos()
                * (launch.direction_deg * constants::DEG_TO_RAD).sin(),
            v0_magnitude
                * (launch.launch_angle_deg * constants::DEG_TO_RAD).cos()
                * (launch.direction_deg * constants::DEG_TO_RAD).cos(),
            v0_magnitude * (launch.launch_angle_deg * constants::DEG_TO_RAD).sin(),
        );

        let w = Vector3d(
            (launch.backspin_rpm * (launch.direction_deg * constants::DEG_TO_RAD).cos()
                - launch.sidespin_rpm
                    * (launch.launch_angle_deg * constants::DEG_TO_RAD).sin()
                    * (launch.direction_deg * constants::DEG_TO_RAD).sin())
                * constants::RPM_TO_RAD_PER_S,
            (-launch.backspin_rpm * (launch.direction_deg * constants::DEG_TO_RAD).sin()
                - launch.sidespin_rpm
                    * (launch.launch_angle_deg * constants::DEG_TO_RAD).sin()
                    * (launch.direction_deg * constants::DEG_TO_RAD).cos())
                * constants::RPM_TO_RAD_PER_S,
            (launch.sidespin_rpm * (launch.launch_angle_deg * constants::DEG_TO_RAD).cos())
                * constants::RPM_TO_RAD_PER_S,
        );

        let vw = Vector3d(
            atmos.wind_mph
                * constants::MPH_TO_FT_PER_S
                * (atmos.wind_direction_deg * constants::DEG_TO_RAD).sin(),
            atmos.wind_mph
                * constants::MPH_TO_FT_PER_S
                * (atmos.wind_direction_deg * constants::DEG_TO_RAD).cos(),
            0.0,
        );

        let air_viscosity = constants::SUTHERLAND_VISCOSITY_COEFF * temp_kelvin.powf(1.5)
            / (temp_kelvin + constants::SUTHERLAND_CONSTANT);

        let diameter_m = ball.circumference_in / (constants::PI * constants::INCHES_PER_METER);
        let re100 = rho_metric * constants::RE100_VELOCITY_M_PER_S * diameter_m / air_viscosity;

        Self {
            atmos,
            rho_metric,
            c0,
            temp_c,
            v0,
            w,
            vw,
            omega,
            r_omega,
            barometric_pressure,
            re100,
            air_viscosity,
        }
    }

    /// Air density in kg/m³.
    pub fn rho_metric(&self) -> f32 {
        self.rho_metric
    }

    /// Drag coefficient scale (includes ball size/mass and air density).
    pub fn c0(&self) -> f32 {
        self.c0
    }

    /// Initial spin vector in rad/s.
    pub fn w(&self) -> Vector3d {
        self.w
    }

    /// Wind velocity vector in ft/s.
    pub fn vw(&self) -> Vector3d {
        self.vw
    }

    /// Air temperature in kelvin.
    pub fn temp_kelvin(&self) -> f32 {
        vector::celsius_to_kelvin(self.temp_c)
    }

    /// Relative humidity in percent.
    pub fn rel_humidity(&self) -> f32 {
        self.atmos.rel_humidity
    }

    /// Air viscosity in kg/(m·s).
    pub fn air_viscosity(&self) -> f32 {
        self.air_viscosity
    }

    /// Barometric pressure in mmHg.
    pub fn barometric_pressure(&self) -> f32 {
        self.barometric_pressure
    }

    /// Reynolds number at 100 mph.
    pub fn re100(&self) -> f32 {
        self.re100
    }

    /// Total spin magnitude in rad/s.
    pub fn omega(&self) -> f32 {
        self.omega
    }

    /// Ball surface speed from spin in ft/s.
    pub fn r_omega(&self) -> f32 {
        self.r_omega
    }

    /// Initial velocity vector in ft/s.
    pub fn v0(&self) -> Vector3d {
        self.v0
    }

    /// Height in feet above which wind affects the ball.
    pub fn height_wind(&self) -> f32 {
        self.atmos.wind_height_ft
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch() -> LaunchData {
        LaunchData {
            ball_speed_mph: 160.0,
            launch_angle_deg: 11.0,
            direction_deg: 0.0,
            backspin_rpm: 3000.0,
            sidespin_rpm: 0.0,
            ..Default::default()
        }
    }

    fn atmos() -> AtmosphericData {
        AtmosphericData {
            temp_f: 70.0,
            rel_humidity: 50.0,
            ..Default::default()
        }
    }

    fn assert_near(actual: f32, expected: f32, tolerance: f32) {
        assert!(
            (actual - expected).abs() < tolerance,
            "expected {expected} ± {tolerance}, got {actual}"
        );
    }

    #[test]
    fn init_vars_default() {
        let vars = ShotPhysicsContext::new(launch(), atmos(), BallProperties::default());
        assert_near(
            vars.rho_metric() * constants::KG_PER_M3_TO_LB_PER_FT3,
            0.0748,
            0.001,
        );
        assert_near(vars.rho_metric(), 1.194, 0.001);
        assert_near(vars.c0(), 0.005682, 0.00001);
        assert_near(vars.v0().magnitude(), 234.72, 0.1);
        assert_near(vars.v0().0, 0.0, 0.1);
        assert_near(vars.v0().1, 230.41, 0.1);
        assert_near(vars.v0().2, 44.79, 0.1);
        assert_near(vars.w().0, 314.16, 0.1);
        assert_near(vars.w().1, 0.0, 0.1);
        assert_near(vars.w().2, 0.0, 0.1);
        assert_near(vars.omega(), 314.16, 0.1);
        assert_near(vars.r_omega(), 21.99, 0.01);
        assert_near(vars.vw().0, 0.0, 0.1);
        assert_near(vars.vw().1, 0.0, 0.1);
        assert_near(vars.barometric_pressure(), 759.97, 0.1);
        assert_near(vars.re100(), 123600.0, 100.0);
    }

    #[test]
    fn init_vars_not_default() {
        let launch = LaunchData {
            sidespin_rpm: 500.0,
            ..launch()
        };
        let atmos = AtmosphericData {
            elevation_ft: 90.0,
            wind_mph: 2.0,
            wind_direction_deg: 30.0,
            wind_height_ft: 50.0,
            ..atmos()
        };
        let vars = ShotPhysicsContext::new(launch, atmos, BallProperties::default());
        assert_near(
            vars.rho_metric() * constants::KG_PER_M3_TO_LB_PER_FT3,
            0.0745,
            0.001,
        );
        assert_near(vars.rho_metric(), 1.190, 0.001);
        assert_near(vars.c0(), 0.005663, 0.00001);
        assert_near(vars.w().0, 314.16, 0.1);
        assert_near(vars.w().1, -9.99, 0.1);
        assert_near(vars.w().2, 51.4, 0.1);
        assert_near(vars.omega(), 318.49, 0.1);
        assert_near(vars.r_omega(), 22.29, 0.01);
        assert_near(vars.vw().0, 1.5, 0.1);
        assert_near(vars.vw().1, 2.5, 0.1);
        assert_near(vars.re100(), 123200.0, 100.0);
    }

    #[test]
    fn default_atmosphere_is_standard_day() {
        let atmos = AtmosphericData::default();
        assert_eq!(atmos.temp_f, 59.0);
        assert_eq!(atmos.elevation_ft, 0.0);
        assert_eq!(atmos.wind_mph, 0.0);
        assert_eq!(atmos.pressure_inhg, 29.92);

        let vars = ShotPhysicsContext::new(launch(), atmos, BallProperties::default());
        assert!((vars.rho_metric() - 1.225).abs() < 0.02);
        assert!(vars.c0() > 0.0);
    }

    #[test]
    fn ball_properties_thread_into_derivation() {
        let implicit = ShotPhysicsContext::new(launch(), atmos(), BallProperties::default());
        let explicit = ShotPhysicsContext::new(
            launch(),
            atmos(),
            BallProperties {
                mass_oz: constants::STD_BALL_MASS_OZ,
                circumference_in: constants::STD_BALL_CIRCUMFERENCE_IN,
            },
        );
        assert_eq!(implicit.c0(), explicit.c0());
        assert_eq!(implicit.r_omega(), explicit.r_omega());
        assert_eq!(implicit.re100(), explicit.re100());

        let heavy = ShotPhysicsContext::new(
            launch(),
            atmos(),
            BallProperties {
                mass_oz: 2.0,
                circumference_in: constants::STD_BALL_CIRCUMFERENCE_IN,
            },
        );
        assert!(heavy.c0() < implicit.c0());
        assert_eq!(heavy.r_omega(), implicit.r_omega());

        let big = ShotPhysicsContext::new(
            launch(),
            atmos(),
            BallProperties {
                mass_oz: constants::STD_BALL_MASS_OZ,
                circumference_in: 6.0,
            },
        );
        assert!(big.c0() > implicit.c0());
        assert!(big.r_omega() > implicit.r_omega());
        assert!(big.re100() > implicit.re100());
    }
}
