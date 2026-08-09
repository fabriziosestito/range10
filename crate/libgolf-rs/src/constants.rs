//! Physical constants and unit conversions used by the flight models.
//!
//! Values match the C++ libgolf source so the Rust port reproduces its
//! results bit-for-bit. Units are imperial unless the name says otherwise.

// Standard golf ball (USGA/R&A conforming limits).
/// Standard golf ball circumference in inches.
pub const STD_BALL_CIRCUMFERENCE_IN: f32 = 5.277;
/// Standard golf ball mass in ounces.
pub const STD_BALL_MASS_OZ: f32 = 1.62;

// Drag-force reference ball used to scale c0 for the actual ball.
/// Drag force constant (lb·s²/ft²) for the reference ball.
pub const DRAG_FORCE_CONST: f32 = 0.07182;
/// Reference ball mass in ounces.
pub const REF_BALL_MASS_OZ: f32 = 5.125;
/// Reference ball circumference in inches.
pub const REF_BALL_CIRC_IN: f32 = 9.125;

/// Standard gravitational acceleration in ft/s².
pub const GRAVITY_FT_PER_S2: f32 = 32.174;
/// Standard air density at sea level in kg/m³.
pub const STD_AIR_DENSITY_KG_PER_M3: f32 = 1.2929;
/// Standard barometric pressure in mmHg.
pub const STD_PRESSURE_MMHG: f32 = 760.0;

/// Kelvin offset of 0 °C.
pub const KELVIN_OFFSET: f32 = 273.15;
/// Fahrenheit offset of 0 °C.
pub const FAHRENHEIT_OFFSET: f32 = 32.0;
/// °F to °C conversion scale.
pub const FAHRENHEIT_TO_CELSIUS_SCALE: f32 = 5.0 / 9.0;

/// Meters to feet conversion.
pub const METERS_TO_FEET: f32 = 3.28084;
/// Feet to meters conversion.
pub const FEET_TO_METERS: f32 = 1.0 / METERS_TO_FEET;
/// Feet per yard.
pub const YARDS_TO_FEET: f32 = 3.0;
/// Inches per foot.
pub const INCHES_PER_FOOT: f32 = 12.0;
/// Inches per meter.
pub const INCHES_PER_METER: f32 = 1.0 / 0.0254;

/// Miles per hour to feet per second conversion.
pub const MPH_TO_FT_PER_S: f32 = 5280.0 / 3600.0;
/// Reference speed (100 mph) used to scale Reynolds numbers, in m/s.
pub const RE100_VELOCITY_M_PER_S: f32 = 44.7;

/// π.
pub const PI: f32 = std::f32::consts::PI;
/// Degrees to radians conversion.
pub const DEG_TO_RAD: f32 = PI / 180.0;
/// RPM to rad/s conversion.
pub const RPM_TO_RAD_PER_S: f32 = PI / 30.0;

/// Inches of mercury to mmHg conversion.
pub const INHG_TO_MMHG: f32 = 1000.0 / INCHES_PER_METER;

/// kg/m³ to lb/ft³ conversion.
pub const KG_PER_M3_TO_LB_PER_FT3: f32 = 0.06261;

/// Exponential pressure-decay coefficient per meter of elevation.
pub const BETA_PRESSURE_DECAY: f32 = 0.0001217;
/// Water-vapor pressure coefficient in the density formula.
pub const WATER_VAPOR_COEFF: f32 = 0.3783;

// Saturated vapor pressure (Magnus formula) coefficients.
/// Saturation vapor pressure coefficient A (mmHg).
pub const SVP_COEFF_A: f32 = 4.5841;
/// Saturation vapor pressure coefficient B.
pub const SVP_COEFF_B: f32 = 18.687;
/// Saturation vapor pressure coefficient C (°C).
pub const SVP_COEFF_C: f32 = 234.5;
/// Saturation vapor pressure coefficient D (°C).
pub const SVP_COEFF_D: f32 = 257.14;

// Sutherland's air viscosity formula coefficients.
/// Sutherland constant (K).
pub const SUTHERLAND_CONSTANT: f32 = 120.0;
/// Sutherland viscosity coefficient (kg/m·s·K^1.5).
pub const SUTHERLAND_VISCOSITY_COEFF: f32 = 0.000001512;

/// Default simulation time step in seconds.
pub const SIMULATION_TIME_STEP: f32 = 0.01;
/// Half (used in the constant-acceleration integration step).
pub const HALF: f32 = 0.5;
/// Maximum simulated flight time in seconds before declaring non-convergence.
pub const MAX_SIMULATION_TIME: f32 = 120.0;

/// Minimum speed (ft/s) below which quantities are treated as zero.
pub const MIN_SPEED: f32 = 0.01;
/// Minimum spin magnitude (rad/s) below which Magnus effects are skipped.
pub const MIN_SPIN: f32 = 0.01;
/// Minimum vector length (ft) below which normalization is rejected.
pub const MIN_LENGTH: f32 = 0.01;

/// Normal velocity (ft/s) below which a bounce is treated as the end of the
/// bounce phase.
pub const MIN_BOUNCE_VELOCITY: f32 = 1.0;
/// Height above ground (ft) at which the ball counts as "in contact".
pub const GROUND_CONTACT_THRESHOLD: f32 = 0.1;
/// Normal z-component above which a surface counts as flat.
pub const FLAT_SURFACE_THRESHOLD: f32 = 0.999;
