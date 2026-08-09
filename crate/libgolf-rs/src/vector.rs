//! 3D vector math and unit conversions shared by the flight models.
//!
//! Positions and velocities are expressed in feet; the y-axis is the target
//! line, the x-axis is lateral (positive = right), and the z-axis is up.

use std::ops::{Add, AddAssign, Mul, MulAssign, Neg, Sub, SubAssign};

use crate::constants;

/// A three-component vector in (x, y, z) order.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector3d(pub f32, pub f32, pub f32);

impl Vector3d {
    /// The zero vector.
    pub const ZERO: Vector3d = Vector3d(0.0, 0.0, 0.0);

    /// Dot product.
    pub fn dot(self, other: Vector3d) -> f32 {
        self.0 * other.0 + self.1 * other.1 + self.2 * other.2
    }

    /// Cross product.
    pub fn cross(self, other: Vector3d) -> Vector3d {
        Vector3d(
            self.1 * other.2 - self.2 * other.1,
            self.2 * other.0 - self.0 * other.2,
            self.0 * other.1 - self.1 * other.0,
        )
    }

    /// Euclidean length.
    pub fn magnitude(self) -> f32 {
        (self.0 * self.0 + self.1 * self.1 + self.2 * self.2).sqrt()
    }

    /// Unit vector in the same direction. Panics on a zero-length vector.
    pub fn normalize(self) -> Vector3d {
        let mag = self.magnitude();
        assert!(
            mag >= constants::MIN_LENGTH,
            "Cannot normalize zero-length vector"
        );
        self * (1.0 / mag)
    }

    /// Orthogonal projection of `self` onto `onto`. Panics if `onto` is
    /// zero-length.
    pub fn project(self, onto: Vector3d) -> Vector3d {
        let onto_mag_squared = onto.dot(onto);
        assert!(
            onto_mag_squared >= constants::MIN_LENGTH * constants::MIN_LENGTH,
            "Cannot project onto zero-length vector"
        );
        onto * (self.dot(onto) / onto_mag_squared)
    }
}

impl Add for Vector3d {
    type Output = Vector3d;
    fn add(self, other: Vector3d) -> Vector3d {
        Vector3d(self.0 + other.0, self.1 + other.1, self.2 + other.2)
    }
}

impl Sub for Vector3d {
    type Output = Vector3d;
    fn sub(self, other: Vector3d) -> Vector3d {
        Vector3d(self.0 - other.0, self.1 - other.1, self.2 - other.2)
    }
}

impl Neg for Vector3d {
    type Output = Vector3d;
    fn neg(self) -> Vector3d {
        Vector3d(-self.0, -self.1, -self.2)
    }
}

impl Mul<f32> for Vector3d {
    type Output = Vector3d;
    fn mul(self, scale: f32) -> Vector3d {
        Vector3d(self.0 * scale, self.1 * scale, self.2 * scale)
    }
}

impl Mul<Vector3d> for f32 {
    type Output = Vector3d;
    fn mul(self, v: Vector3d) -> Vector3d {
        v * self
    }
}

impl AddAssign for Vector3d {
    fn add_assign(&mut self, other: Vector3d) {
        *self = *self + other;
    }
}

impl SubAssign for Vector3d {
    fn sub_assign(&mut self, other: Vector3d) {
        *self = *self - other;
    }
}

impl MulAssign<f32> for Vector3d {
    fn mul_assign(&mut self, scale: f32) {
        *self = *self * scale;
    }
}

/// Converts degrees Fahrenheit to degrees Celsius.
pub fn fahrenheit_to_celsius(fahrenheit: f32) -> f32 {
    (fahrenheit - constants::FAHRENHEIT_OFFSET) * constants::FAHRENHEIT_TO_CELSIUS_SCALE
}

/// Converts degrees Celsius to kelvin.
pub fn celsius_to_kelvin(celsius: f32) -> f32 {
    celsius + constants::KELVIN_OFFSET
}

/// Converts feet to meters.
pub fn feet_to_meters(feet: f32) -> f32 {
    feet * constants::FEET_TO_METERS
}

/// Horizontal distance of a position from the origin, in yards.
pub fn distance_in_yards(position: Vector3d) -> f32 {
    (position.0 * position.0 + position.1 * position.1).sqrt() / constants::YARDS_TO_FEET
}
