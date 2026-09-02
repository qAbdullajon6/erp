import { Injectable } from "@nestjs/common";
import { TelematicsProviderType } from "@prisma/client";
import {
  asRecord,
  bool,
  KNOTS_TO_KPH,
  num,
  parseTimestamp,
  ProviderNormalizationError,
  type NormalizedPosition,
  type TelematicsProvider,
} from "./telematics-provider.interface";

/// Traccar / OsmAnd protocol.
///
/// Two distinct wire shapes land here, and both are handled:
///
/// 1. Traccar's OWN webhook shape — what a real Traccar server (via its
///    `forward.url` position forwarding, or a per-device "Web Request"
///    notification) actually POSTs. It is a NESTED object,
///    `{ position: {...}, device: {...} }`, produced by Jackson-serialising
///    Traccar's internal `Position`/`Device` model classes: `latitude`/
///    `longitude` (never the short `lat`/`lon`), `deviceId` (Traccar's own
///    numeric row id — NOT usable as a cross-tenant identifier), and the
///    IMEI/uniqueId nested at `device.uniqueId`. Speed arrives in KNOTS,
///    matching Traccar's internal storage unit regardless of source
///    protocol. Verified empirically against a real traccar/traccar:6.4
///    instance (see docker-compose.local.yml) — this is what the S-2423
///    will actually produce once Traccar is decoding its NAVTELECOM/FLEX
///    traffic, so it is the primary case, not a fallback.
/// 2. The flat OsmAnd/Traccar-Client wire shape — `id`, `lat`/`lon`,
///    `timestamp` (epoch seconds), `speed` in knots, `bearing`, `altitude`,
///    `batt`. This is what a device (or the OsmAnd/Traccar Client phone
///    app) sends TO Traccar directly; it never reaches FlowERP in the
///    documented architecture, but is kept as a fallback since it's also
///    what docs/TRACCAR_SETUP.md's no-hardware GPS-simulator script posts
///    for manual testing.
@Injectable()
export class TraccarProvider implements TelematicsProvider {
  readonly type = TelematicsProviderType.TRACCAR;

  normalize(payload: unknown): NormalizedPosition[] {
    const items = Array.isArray(payload) ? payload : [payload];
    return items.map((item) => this.one(item));
  }

  private one(raw: unknown): NormalizedPosition {
    const root = asRecord(raw);
    // Traccar's own webhook body nests the actual fix under `position`, with
    // sibling `device`/`event` objects — unwrap it so the rest of this
    // method reads one flat record regardless of which shape arrived.
    const p = typeof root.position === "object" && root.position !== null ? asRecord(root.position) : root;
    const device = typeof root.device === "object" && root.device !== null ? asRecord(root.device) : null;

    const latitude = num(p.lat ?? p.latitude);
    const longitude = num(p.lon ?? p.longitude);
    if (latitude == null || longitude == null) {
      throw new ProviderNormalizationError("Traccar payload missing lat/lon");
    }

    const speedKnots = num(p.speed);
    const battery = num(p.batt ?? p.battery);

    // Prefer the IMEI/uniqueId Traccar carries on `device` — `id` at the top
    // level or on `position` is Traccar's own numeric row id there, never a
    // usable cross-tenant identifier.
    const rawExternalId = device?.uniqueId ?? p.id ?? root.id;
    const externalDeviceId =
      typeof rawExternalId === "string"
        ? rawExternalId
        : typeof rawExternalId === "number" || typeof rawExternalId === "boolean"
          ? String(rawExternalId)
          : null;

    return {
      externalDeviceId,
      recordedAt: parseTimestamp(p.timestamp ?? p.time ?? p.fixTime ?? p.deviceTime) ?? new Date(),
      latitude,
      longitude,
      altitudeM: num(p.altitude),
      speedKph: speedKnots != null ? speedKnots * KNOTS_TO_KPH : null,
      heading: num(p.bearing ?? p.heading ?? p.course),
      accuracyM: num(p.accuracy),
      ignitionOn: bool(p.ignition),
      odometerKm: num(p.totalDistance) != null ? num(p.totalDistance)! / 1000 : null,
      satellites: num(p.sat ?? p.satellites),
      fuelLevelPct: num(p.fuel),
      health:
        battery != null
          ? { batteryVoltage: battery > 100 ? battery / 1000 : battery }
          : null,
      raw,
    };
  }
}
