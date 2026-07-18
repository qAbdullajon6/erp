import { Injectable } from "@nestjs/common";
import { TelematicsProviderType } from "@prisma/client";
import {
  asRecord,
  MPH_TO_KPH,
  num,
  parseTimestamp,
  ProviderNormalizationError,
  type NormalizedPosition,
  type TelematicsProvider,
} from "./telematics-provider.interface";

/// Samsara fleet platform.
///
/// Maps Samsara's documented vehicle-location shape: a `data` array of vehicle
/// objects each carrying a `gps` block (`latitude`, `longitude`,
/// `headingDegrees`, `speedMilesPerHour`, `time`). Also accepts the webhook
/// envelope `{ eventType, data: {...} }` and a single bare vehicle object.
/// Speed is mph on the wire → converted to km/h.
///
/// The field names follow Samsara's public API docs; per TD-TELEMATICS-03 the
/// mapping should be confirmed against a live Samsara account's webhook sample
/// before that integration is switched on for a customer.
@Injectable()
export class SamsaraProvider implements TelematicsProvider {
  readonly type = TelematicsProviderType.SAMSARA;

  normalize(payload: unknown): NormalizedPosition[] {
    const root = asRecord(payload);
    const data = root.data;
    const vehicles = Array.isArray(data) ? data : data != null ? [data] : [root];
    const positions = vehicles
      .map((v) => this.one(v))
      .filter((p): p is NormalizedPosition => p !== null);
    if (positions.length === 0) {
      throw new ProviderNormalizationError("Samsara payload contained no usable GPS fixes");
    }
    return positions;
  }

  private one(raw: unknown): NormalizedPosition | null {
    const vehicle = asRecord(raw);
    const gps = vehicle.gps && typeof vehicle.gps === "object" ? asRecord(vehicle.gps) : vehicle;
    const latitude = num(gps.latitude);
    const longitude = num(gps.longitude);
    if (latitude == null || longitude == null) return null;

    const mph = num(gps.speedMilesPerHour);
    return {
      externalDeviceId:
        typeof vehicle.id === "string" ? vehicle.id : vehicle.id != null ? String(vehicle.id) : null,
      recordedAt: parseTimestamp(gps.time ?? vehicle.time) ?? new Date(),
      latitude,
      longitude,
      speedKph: mph != null ? mph * MPH_TO_KPH : null,
      heading: num(gps.headingDegrees ?? gps.heading),
      raw,
    };
  }
}
