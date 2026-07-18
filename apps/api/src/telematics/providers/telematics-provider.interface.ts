import type { TelematicsProviderType } from "@prisma/client";

/// The GPS-provider abstraction.
///
/// Every device — a Traccar unit, a Samsara webhook, a Geotab feed, a driver's
/// phone — speaks its own wire format. A provider's one job is to turn that
/// wire format into `NormalizedPosition[]`. Nothing downstream (ingestion,
/// trips, alerts, the live map) knows which vendor a fix came from, so adding a
/// vendor is a new normalizer here and a row in the registry — never a change
/// to the ingestion pipeline.

export interface NormalizedHealth {
  odometerKm?: number | null;
  engineHours?: number | null;
  fuelLevelPct?: number | null;
  batteryVoltage?: number | null;
  coolantTempC?: number | null;
  engineTempC?: number | null;
  checkEngineOn?: boolean | null;
  dtcCodes?: string[] | null;
  tirePressures?: number[] | null;
}

export interface NormalizedPosition {
  /// The device's id in the provider's own system. Used to resolve which
  /// TelematicsDevice (and therefore which vehicle) this fix belongs to.
  externalDeviceId?: string | null;
  recordedAt: Date;
  latitude: number;
  longitude: number;
  altitudeM?: number | null;
  /// Always km/h once normalised — providers reporting knots or mph are
  /// converted here so the rest of the system has one unit.
  speedKph?: number | null;
  /// Degrees clockwise from true north, 0–360.
  heading?: number | null;
  accuracyM?: number | null;
  ignitionOn?: boolean | null;
  odometerKm?: number | null;
  fuelLevelPct?: number | null;
  satellites?: number | null;
  /// Optional diagnostics riding along with the position.
  health?: NormalizedHealth | null;
  /// The untouched source payload, persisted on GpsPosition.raw for audit and
  /// for re-normalising if a mapping bug is ever found.
  raw?: unknown;
}

/// Raised when a payload cannot be turned into any valid position. The message
/// is returned to the device/integrator (400), so it names the problem
/// concretely rather than leaking a stack trace.
export class ProviderNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNormalizationError";
  }
}

export interface TelematicsProvider {
  readonly type: TelematicsProviderType;
  /// Turns a raw request body into zero or more normalised positions. Throws
  /// ProviderNormalizationError when the body is unusable.
  normalize(payload: unknown): NormalizedPosition[];
}

// --- Shared parsing helpers, reused across the concrete providers -----------

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderNormalizationError("Expected a JSON object payload");
  }
  return value as Record<string, unknown>;
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (["true", "1", "on", "yes"].includes(v)) return true;
    if (["false", "0", "off", "no"].includes(v)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return null;
}

/// Parses a timestamp that may be ISO-8601, epoch seconds, or epoch
/// milliseconds. Returns null (caller decides to default to now) when absent
/// or unparseable rather than producing an Invalid Date.
export function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Heuristic: 10-digit values are seconds, 13-digit are milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && /^\d+$/.test(value.trim())) {
      return parseTimestamp(asNumber);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const KNOTS_TO_KPH = 1.852;
export const MPH_TO_KPH = 1.609344;
