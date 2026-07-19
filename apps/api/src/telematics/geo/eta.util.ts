import { haversineKm, pathLengthKm, type LatLng } from "./haversine.util";

/// ETA estimation from live telematics.
///
/// This is a kinematic estimate, not a routing-engine ETA: we have the
/// vehicle's position and recent speed, not the road graph. Two honest
/// corrections make the straight-line number usable:
///
///   1. a winding factor — road distance exceeds crow-flies distance by a
///      fairly stable ratio (~1.3 in mixed driving), so the remaining distance
///      is scaled up rather than reported as the optimistic straight line;
///   2. a speed floor — a vehicle currently stopped at a light has a live speed
///      of 0, which would yield an infinite ETA, so the effective speed falls
///      back to the trip average and then to an urban default.
///
/// Documented as an approximation in FLEET_TELEMATICS_API.md; a routing
/// provider can later replace `remainingKm` without changing callers.

/// Typical road-distance-to-straight-line ratio. Applied to crow-flies
/// remaining distance so the ETA is not systematically optimistic.
export const DEFAULT_WINDING_FACTOR = 1.3;

/// Urban fallback speed (km/h) when neither a live nor an average speed is
/// usable — a moving vehicle with a momentarily-zero reading still gets a
/// sane ETA.
export const DEFAULT_FALLBACK_SPEED_KPH = 35;

/// Below this the live speed is treated as "not really moving" and ignored in
/// favour of the average/fallback, so a red light does not blow up the ETA.
const MIN_MEANINGFUL_SPEED_KPH = 5;

export interface EtaInput {
  current: LatLng;
  destination: LatLng;
  /// Instantaneous speed from the latest fix, km/h.
  recentSpeedKph?: number | null;
  /// The trip's rolling average speed, km/h.
  avgSpeedKph?: number | null;
  /// Optional remaining route waypoints (current -> w1 -> ... -> destination).
  /// When present, distance is summed along them instead of a single leg.
  remainingWaypoints?: LatLng[];
  windingFactor?: number;
  fallbackSpeedKph?: number;
  now?: Date;
}

export interface EtaResult {
  /// Estimated road distance still to cover, km.
  remainingKm: number;
  /// The speed the estimate used, km/h.
  effectiveSpeedKph: number;
  /// Seconds until arrival at the effective speed. Integer.
  etaSeconds: number;
  /// Absolute arrival timestamp.
  etaAt: Date;
}

/// Straight-line remaining distance, scaled by the winding factor. If waypoints
/// are supplied the crow-flies path length through them is used instead of a
/// single leg — closer to the real route when one is known.
export function remainingKm(input: EtaInput): number {
  const winding = input.windingFactor ?? DEFAULT_WINDING_FACTOR;
  const straight =
    input.remainingWaypoints && input.remainingWaypoints.length > 0
      ? pathLengthKm([input.current, ...input.remainingWaypoints, input.destination])
      : haversineKm(input.current, input.destination);
  return straight * winding;
}

/// Chooses the speed the ETA is computed at: a meaningful live speed, else the
/// trip average, else the urban fallback.
export function effectiveSpeedKph(input: EtaInput): number {
  const fallback = input.fallbackSpeedKph ?? DEFAULT_FALLBACK_SPEED_KPH;
  const recent = input.recentSpeedKph ?? 0;
  if (Number.isFinite(recent) && recent >= MIN_MEANINGFUL_SPEED_KPH) return recent;

  const avg = input.avgSpeedKph ?? 0;
  if (Number.isFinite(avg) && avg >= MIN_MEANINGFUL_SPEED_KPH) return avg;

  return fallback;
}

export function computeEta(input: EtaInput): EtaResult {
  const now = input.now ?? new Date();
  const km = remainingKm(input);
  const speed = effectiveSpeedKph(input);
  const etaSeconds = speed > 0 ? Math.round((km / speed) * 3600) : 0;
  return {
    remainingKm: km,
    effectiveSpeedKph: speed,
    etaSeconds,
    etaAt: new Date(now.getTime() + etaSeconds * 1000),
  };
}
