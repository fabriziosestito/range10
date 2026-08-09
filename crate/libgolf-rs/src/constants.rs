pub const STD_BALL_CIRCUMFERENCE_IN: f32 = 5.277;
pub const STD_BALL_MASS_OZ: f32 = 1.62;

pub const DRAG_FORCE_CONST: f32 = 0.07182;
pub const REF_BALL_MASS_OZ: f32 = 5.125;
pub const REF_BALL_CIRC_IN: f32 = 9.125;

pub const GRAVITY_FT_PER_S2: f32 = 32.174;
pub const STD_AIR_DENSITY_KG_PER_M3: f32 = 1.2929;
pub const STD_PRESSURE_MMHG: f32 = 760.0;

pub const KELVIN_OFFSET: f32 = 273.15;
pub const FAHRENHEIT_OFFSET: f32 = 32.0;
pub const FAHRENHEIT_TO_CELSIUS_SCALE: f32 = 5.0 / 9.0;

pub const METERS_TO_FEET: f32 = 3.28084;
pub const FEET_TO_METERS: f32 = 1.0 / METERS_TO_FEET;
pub const YARDS_TO_FEET: f32 = 3.0;
pub const INCHES_PER_FOOT: f32 = 12.0;
pub const INCHES_PER_METER: f32 = 1.0 / 0.0254;

pub const MPH_TO_FT_PER_S: f32 = 5280.0 / 3600.0;
pub const RE100_VELOCITY_M_PER_S: f32 = 44.7;

pub const PI: f32 = std::f32::consts::PI;
pub const DEG_TO_RAD: f32 = PI / 180.0;
pub const RPM_TO_RAD_PER_S: f32 = PI / 30.0;

pub const INHG_TO_MMHG: f32 = 1000.0 / INCHES_PER_METER;

pub const KG_PER_M3_TO_LB_PER_FT3: f32 = 0.06261;

pub const BETA_PRESSURE_DECAY: f32 = 0.0001217;
pub const WATER_VAPOR_COEFF: f32 = 0.3783;

pub const SVP_COEFF_A: f32 = 4.5841;
pub const SVP_COEFF_B: f32 = 18.687;
pub const SVP_COEFF_C: f32 = 234.5;
pub const SVP_COEFF_D: f32 = 257.14;

pub const SUTHERLAND_CONSTANT: f32 = 120.0;
pub const SUTHERLAND_VISCOSITY_COEFF: f32 = 0.000001512;

pub const SIMULATION_TIME_STEP: f32 = 0.01;
pub const HALF: f32 = 0.5;
pub const MAX_SIMULATION_TIME: f32 = 120.0;

pub const MIN_SPEED: f32 = 0.01;
pub const MIN_SPIN: f32 = 0.01;
pub const MIN_LENGTH: f32 = 0.01;

pub const MIN_BOUNCE_VELOCITY: f32 = 1.0;
pub const GROUND_CONTACT_THRESHOLD: f32 = 0.1;
pub const FLAT_SURFACE_THRESHOLD: f32 = 0.999;
