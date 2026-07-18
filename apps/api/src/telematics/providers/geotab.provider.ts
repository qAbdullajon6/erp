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

/// Geotab MyGeotab.
///
/// Maps Geotab's DeviceStatusInfo / LogRecord shape: `{ device: { id },
/// dateTime, latitude, longitude, speed, bearing, isDriving }`, where speed is
/// already km/h. Accepts a single record or an array of them.
///
/// As with Samsara (TD-TELEMATICS-03), confirm the mapping against a live
/// MyGeotab feed before enabling for a customer.
@Injectable()
export class GeotabProvider implements TelematicsProvider {
  readonly type = TelematicsProviderType.GEOTAB;

  normalize(payload: unknown): NormalizedPosition[] {
    const items = Array.isArray(payload) ? payload : [payload];
    const positions = items
      .map((item) => this.one(item))
      .filter((p): p is NormalizedPosition => p !== null);
    if (positions.length === 0) {
      throw new ProviderNormalizationError("Geotab payload contained no usable fixes");
    }
    return positions;
  }

  private one(raw: unknown): NormalizedPosition | null {
    const record = asRecord(raw);
    const latitude = num(record.latitude);
    const longitude = num(record.longitude);
    if (latitude == null || longitude == null) return null;

    const device = record.device && typeof record.device === "object" ? asRecord(record.device) : null;
    const deviceId = device?.id ?? record.deviceId;

    return {
      externalDeviceId: typeof deviceId === "string" ? deviceId : deviceId != null ? String(deviceId) : null,
      recordedAt: parseTimestamp(record.dateTime ?? record.time) ?? new Date(),
      latitude,
      longitude,
      // Geotab speed is km/h already.
      speedKph: num(record.speed),
      heading: num(record.bearing),
      ignitionOn: bool(record.isDriving),
      raw,
    };
  }
}
