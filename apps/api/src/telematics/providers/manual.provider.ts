import { Injectable } from "@nestjs/common";
import { TelematicsProviderType } from "@prisma/client";
import {
  asRecord,
  bool,
  num,
  parseTimestamp,
  ProviderNormalizationError,
  type NormalizedPosition,
  type TelematicsProvider,
} from "./telematics-provider.interface";

/// First-party source: the driver mobile app and dispatcher hand-entry. It
/// posts the already-normalised shape (this is our own client), so this
/// provider is a strict validator rather than a translator. It also backs the
/// GENERIC_WEBHOOK type — any integrator willing to post our shape needs no
/// vendor adapter.
///
/// Accepts either a single position object or an array of them.
@Injectable()
export class ManualProvider implements TelematicsProvider {
  readonly type = TelematicsProviderType.MANUAL;

  normalize(payload: unknown): NormalizedPosition[] {
    const items = Array.isArray(payload) ? payload : [payload];
    if (items.length === 0) {
      throw new ProviderNormalizationError("No positions in payload");
    }
    return items.map((item, index) => this.one(item, index));
  }

  private one(raw: unknown, index: number): NormalizedPosition {
    const p = asRecord(raw);
    const latitude = num(p.latitude ?? p.lat);
    const longitude = num(p.longitude ?? p.lng ?? p.lon);
    if (latitude == null || longitude == null) {
      throw new ProviderNormalizationError(
        `Position at index ${index} is missing a numeric latitude/longitude`,
      );
    }
    const recordedAt = parseTimestamp(p.recordedAt ?? p.timestamp ?? p.time) ?? new Date();

    return {
      externalDeviceId: typeof p.deviceId === "string" ? p.deviceId : typeof p.externalDeviceId === "string" ? p.externalDeviceId : null,
      recordedAt,
      latitude,
      longitude,
      altitudeM: num(p.altitudeM ?? p.altitude),
      speedKph: num(p.speedKph ?? p.speed),
      heading: num(p.heading ?? p.bearing ?? p.course),
      accuracyM: num(p.accuracyM ?? p.accuracy),
      ignitionOn: bool(p.ignitionOn ?? p.ignition),
      odometerKm: num(p.odometerKm ?? p.odometer),
      fuelLevelPct: num(p.fuelLevelPct ?? p.fuel),
      satellites: num(p.satellites ?? p.sats),
      raw,
    };
  }
}
