import type { IngestPositionDto } from "../dto/ingest-positions.dto";
import type { NormalizedPosition } from "../providers/telematics-provider.interface";

/// Maps the validated first-party ingest DTO onto the internal normalized
/// shape. The DTO has already enforced ranges/types, so this is a pure
/// field rename — no parsing, no defaulting beyond recordedAt.
export function normalizeIngestDto(dto: IngestPositionDto): NormalizedPosition {
  return {
    recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
    latitude: dto.latitude,
    longitude: dto.longitude,
    speedKph: dto.speedKph ?? null,
    heading: dto.heading ?? null,
    altitudeM: dto.altitudeM ?? null,
    accuracyM: dto.accuracyM ?? null,
    ignitionOn: dto.ignitionOn ?? null,
    odometerKm: dto.odometerKm ?? null,
    fuelLevelPct: dto.fuelLevelPct ?? null,
    satellites: dto.satellites ?? null,
  };
}
