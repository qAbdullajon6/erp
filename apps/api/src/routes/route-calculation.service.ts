import { Injectable, Logger } from "@nestjs/common";
import { MapboxService } from "../telematics/mapbox/mapbox.service";

export interface RouteLeg {
  fromSequence: number;
  toSequence: number;
  distanceM: number;
  durationSec: number;
  geometry?: [number, number][];
}

export interface RouteCalculation {
  totalDistanceM: number;
  totalDurationSec: number;
  calculationStatus: "SUCCESS" | "PARTIAL" | "UNAVAILABLE";
  geometry: [number, number][] | null;
  legs: RouteLeg[];
}

export interface StopCoord {
  sequence: number;
  lat: number;
  lng: number;
}

/// Provider-agnostic route calculation. Currently backed by Mapbox when
/// configured; returns zero-value legs when no provider is available so
/// callers always receive a structurally valid result.
///
/// Replaceable with OSRM / Google Routes / HERE / any directions API by
/// swapping the backing provider — the interface is stable.
@Injectable()
export class RouteCalculationService {
  private readonly logger = new Logger(RouteCalculationService.name);

  constructor(private readonly mapbox: MapboxService) {}

  async calculate(stops: StopCoord[]): Promise<RouteCalculation | null> {
    if (stops.length < 2) return null;

    if (!this.mapbox.isConfigured()) {
      return this.nullResult(stops);
    }

    const legs: RouteLeg[] = [];
    let totalDistanceM = 0;
    let totalDurationSec = 0;
    let anyFailed = false;
    const allCoords: [number, number][] = [];

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];
      const to = stops[i + 1];
      try {
        const result = await this.mapbox.directions({
          origin: { lat: from.lat, lng: from.lng },
          destination: { lat: to.lat, lng: to.lng },
        });
        const legCoords = result.geometry.coordinates;
        legs.push({
          fromSequence: from.sequence,
          toSequence: to.sequence,
          distanceM: result.distanceM,
          durationSec: result.durationSec,
          geometry: legCoords,
        });
        totalDistanceM += result.distanceM;
        totalDurationSec += result.durationSec;

        // Aggregate geometry: for all legs after the first, skip the first
        // coordinate (it's the same as the last of the previous leg)
        if (allCoords.length === 0) {
          allCoords.push(...legCoords);
        } else {
          allCoords.push(...legCoords.slice(1));
        }
      } catch (err) {
        this.logger.warn(
          `Leg ${from.sequence}→${to.sequence} calculation failed: ${(err as Error).message}`,
        );
        legs.push({ fromSequence: from.sequence, toSequence: to.sequence, distanceM: 0, durationSec: 0 });
        anyFailed = true;
      }
    }

    const calculationStatus = anyFailed
      ? legs.every((l) => l.distanceM === 0 && l.durationSec === 0)
        ? "UNAVAILABLE"
        : "PARTIAL"
      : "SUCCESS";

    return {
      totalDistanceM,
      totalDurationSec,
      calculationStatus,
      geometry: allCoords.length >= 2 ? allCoords : null,
      legs,
    };
  }

  private nullResult(stops: StopCoord[]): RouteCalculation {
    const legs: RouteLeg[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      legs.push({ fromSequence: stops[i].sequence, toSequence: stops[i + 1].sequence, distanceM: 0, durationSec: 0 });
    }
    return { totalDistanceM: 0, totalDurationSec: 0, calculationStatus: "UNAVAILABLE", geometry: null, legs };
  }
}
