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
/// The open-source Traccar Client (and OsmAnd) reports a flat object keyed
/// `id`, `lat`/`lon` (or `latitude`/`longitude`), `timestamp` (epoch seconds),
/// `speed` in KNOTS, `bearing`, `altitude`, `batt`, `hdop`. Speed-in-knots is
/// the classic footgun here — it is converted to km/h so nothing downstream
/// has to remember the unit. Traccar Client also posts these as query-string
/// params; the ingest controller lifts the query into the body so both forms
/// land here identically.
@Injectable()
export class TraccarProvider implements TelematicsProvider {
  readonly type = TelematicsProviderType.TRACCAR;

  normalize(payload: unknown): NormalizedPosition[] {
    const items = Array.isArray(payload) ? payload : [payload];
    return items.map((item) => this.one(item));
  }

  private one(raw: unknown): NormalizedPosition {
    const p = asRecord(raw);
    const latitude = num(p.lat ?? p.latitude);
    const longitude = num(p.lon ?? p.longitude);
    if (latitude == null || longitude == null) {
      throw new ProviderNormalizationError("Traccar payload missing lat/lon");
    }

    const speedKnots = num(p.speed);
    const battery = num(p.batt ?? p.battery);

    return {
      externalDeviceId: typeof p.id === "string" ? p.id : p.id != null ? String(p.id) : null,
      recordedAt: parseTimestamp(p.timestamp ?? p.time ?? p.fixTime) ?? new Date(),
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
