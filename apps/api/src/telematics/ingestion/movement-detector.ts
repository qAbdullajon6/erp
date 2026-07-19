import type { MovementState } from "@prisma/client";

/// Classifies each GPS fix into a motion state and detects the idle/stop
/// threshold crossings the alert engine and trip recorder react to.
///
/// Pure and history-light on purpose: it takes only the previous persisted
/// state (from VehicleTelematicsState) and the new fix, and returns the next
/// state plus exactly-once transition flags. "Exactly once" is the whole
/// value here — a vehicle sat at a depot emits a ping every few seconds, and
/// without the crossing flags every one of them would look like a fresh idle.

/// A fix at or above this ground speed (km/h) counts as moving. Set just above
/// GPS jitter-at-rest so a parked vehicle's noisy fixes don't read as creeping.
export const MOVING_SPEED_KPH = 5;

export interface MovementFix {
  speedKph: number | null;
  ignitionOn: boolean | null;
  recordedAt: Date;
}

export interface MovementPriorState {
  movementState: MovementState;
  lastMovingAt: Date | null;
  stationarySince: Date | null;
  /// The recordedAt of the previous fix, so the previous stationary duration
  /// can be reconstructed for the exactly-once crossing test.
  lastRecordedAt: Date | null;
}

export interface MovementConfig {
  idleThresholdSec: number;
  stopThresholdSec: number;
  movingSpeedKph?: number;
}

export interface MovementResult {
  movementState: MovementState;
  lastMovingAt: Date | null;
  stationarySince: Date | null;
  /// Seconds the vehicle has been continuously stationary as of this fix.
  stationarySec: number;
  /// Transitioned from moving (or unknown) to not-moving on this fix.
  becameStationary: boolean;
  /// Transitioned from not-moving to moving on this fix.
  becameMoving: boolean;
  /// Crossed the idle threshold (engine on, not moving) on this fix — fires once.
  crossedIdleThreshold: boolean;
  /// Crossed the stop threshold (not moving long enough to be a real stop) on
  /// this fix — fires once.
  crossedStopThreshold: boolean;
}

function secondsBetween(a: Date, b: Date): number {
  return Math.max(0, (a.getTime() - b.getTime()) / 1000);
}

export function classifyMovement(
  fix: MovementFix,
  prior: MovementPriorState,
  config: MovementConfig,
): MovementResult {
  const movingSpeed = config.movingSpeedKph ?? MOVING_SPEED_KPH;
  const isMoving = (fix.speedKph ?? 0) >= movingSpeed;
  const wasMoving = prior.movementState === "MOVING";

  if (isMoving) {
    return {
      movementState: "MOVING",
      lastMovingAt: fix.recordedAt,
      stationarySince: null,
      stationarySec: 0,
      becameStationary: false,
      becameMoving: !wasMoving,
      crossedIdleThreshold: false,
      crossedStopThreshold: false,
    };
  }

  // Not moving. Continue the current stationary spell, or open a new one.
  const stationarySince = prior.stationarySince ?? fix.recordedAt;
  const stationarySec = secondsBetween(fix.recordedAt, stationarySince);
  const priorStationarySec =
    prior.lastRecordedAt && prior.stationarySince
      ? secondsBetween(prior.lastRecordedAt, prior.stationarySince)
      : 0;

  // Engine running but stationary is IDLING; ignition off/unknown is STOPPED.
  const movementState: MovementState = fix.ignitionOn === true ? "IDLING" : "STOPPED";

  const idleExceededNow = fix.ignitionOn === true && stationarySec >= config.idleThresholdSec;
  const idleExceededPrior =
    prior.movementState === "IDLING" && priorStationarySec >= config.idleThresholdSec;

  const stopExceededNow = stationarySec >= config.stopThresholdSec;
  const stopExceededPrior =
    !wasMoving && prior.stationarySince != null && priorStationarySec >= config.stopThresholdSec;

  return {
    movementState,
    lastMovingAt: prior.lastMovingAt,
    stationarySince,
    stationarySec,
    becameStationary: wasMoving || prior.movementState === "UNKNOWN" || prior.movementState === "OFFLINE",
    becameMoving: false,
    crossedIdleThreshold: idleExceededNow && !idleExceededPrior,
    crossedStopThreshold: stopExceededNow && !stopExceededPrior,
  };
}
