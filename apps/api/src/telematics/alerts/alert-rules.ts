import type { NotificationSeverity } from "@prisma/client";

/// The numeric heart of the alert engine, kept pure so the thresholds and the
/// physics are unit-tested without a database. The engine service composes
/// these into persisted TelematicsAlert rows; nothing here touches Prisma.

const KPH_TO_MS = 1000 / 3600;

/// Amount by which a speed exceeds the effective limit (limit + tolerance), in
/// km/h. Zero when within limits. The tolerance absorbs GPS/speedometer error
/// and normal flow-of-traffic overshoot so alerts mean "meaningfully fast".
export function overSpeedKph(speedKph: number | null, limitKph: number, toleranceKph: number): number {
  if (speedKph == null || !Number.isFinite(speedKph)) return 0;
  const effectiveLimit = limitKph + toleranceKph;
  return Math.max(0, speedKph - effectiveLimit);
}

export function isSpeeding(speedKph: number | null, limitKph: number, toleranceKph: number): boolean {
  return overSpeedKph(speedKph, limitKph, toleranceKph) > 0;
}

/// Severity scales with how far over the limit the vehicle is. The bands are
/// the ones surfaced in FLEET_TELEMATICS_API.md.
export function speedingSeverity(overKph: number): NotificationSeverity {
  if (overKph >= 40) return "CRITICAL";
  if (overKph >= 25) return "HIGH";
  if (overKph >= 10) return "MEDIUM";
  return "LOW";
}

/// Signed longitudinal acceleration between two fixes, m/s². Positive is
/// acceleration, negative is braking.
export function accelerationMs2(prevSpeedKph: number, currSpeedKph: number, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const deltaMs = (currSpeedKph - prevSpeedKph) * KPH_TO_MS;
  return deltaMs / seconds;
}

/// Estimated lateral acceleration through a heading change, m/s². Models the
/// turn as a ≈ v·ω, where ω is the yaw rate (heading change over time). Used to
/// flag harsh cornering, which longitudinal accel alone cannot see.
export function lateralAccelerationMs2(
  speedKph: number,
  headingDeltaDeg: number,
  seconds: number,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const vMs = speedKph * KPH_TO_MS;
  const yawRateRadPerS = (Math.abs(headingDeltaDeg) * Math.PI) / 180 / seconds;
  return vMs * yawRateRadPerS;
}

/// Smallest signed difference between two headings, in degrees, in [-180, 180].
/// So a swing from 350° to 10° is +20°, not −340°.
export function headingDeltaDeg(prevHeading: number, currHeading: number): number {
  let delta = ((currHeading - prevHeading + 540) % 360) - 180;
  // -180 and 180 are the same magnitude; normalise -180 to 180 for stability.
  if (delta === -180) delta = 180;
  return delta;
}

export interface HarshConfig {
  harshAccelMs2: number;
  harshBrakeMs2: number;
  harshCornerMs2: number;
}

export interface HarshResult {
  accel: number;
  brake: number;
  cornering: number;
  isHarshAccel: boolean;
  isHarshBrake: boolean;
  isHarshCorner: boolean;
}

/// Classifies harsh acceleration, braking and cornering from two consecutive
/// fixes. Braking magnitude is reported positive (the absolute deceleration).
export function classifyHarshDriving(
  prev: { speedKph: number; heading: number | null },
  curr: { speedKph: number; heading: number | null },
  seconds: number,
  config: HarshConfig,
): HarshResult {
  const longitudinal = accelerationMs2(prev.speedKph, curr.speedKph, seconds);
  const accel = Math.max(0, longitudinal);
  const brake = Math.max(0, -longitudinal);

  let cornering = 0;
  if (prev.heading != null && curr.heading != null) {
    const delta = headingDeltaDeg(prev.heading, curr.heading);
    cornering = lateralAccelerationMs2(curr.speedKph, delta, seconds);
  }

  return {
    accel,
    brake,
    cornering,
    isHarshAccel: accel >= config.harshAccelMs2,
    isHarshBrake: brake >= config.harshBrakeMs2,
    isHarshCorner: cornering >= config.harshCornerMs2,
  };
}
