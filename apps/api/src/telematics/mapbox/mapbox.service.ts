import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TelematicsConfig } from "../../config/configuration";

export type MapPoint = { lat: number; lng: number };

export interface DirectionsResult {
  distanceM: number;
  durationSec: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  geojson: {
    type: "Feature";
    properties: {
      distanceM: number;
      durationSec: number;
    };
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  };
}

export interface ReverseGeocodeResult {
  street: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  placeName: string | null;
}

/// Server-side Mapbox client. Uses MAPBOX_SECRET_TOKEN only — never returned
/// to browsers. Public map tiles use VITE_MAPBOX_ACCESS_TOKEN on the web app.
@Injectable()
export class MapboxService {
  private readonly logger = new Logger(MapboxService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.secretToken());
  }

  async directions(input: {
    origin: MapPoint;
    destination: MapPoint;
    waypoints?: MapPoint[];
  }): Promise<DirectionsResult> {
    const token = this.requireToken();
    const coords = [
      input.origin,
      ...(input.waypoints ?? []),
      input.destination,
    ]
      .map((p) => `${p.lng},${p.lat}`)
      .join(";");

    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`,
    );
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("access_token", token);

    const data = await this.mapboxFetch<{
      code?: string;
      message?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    }>(url);

    const route = data.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coordinates) || coordinates.length < 2) {
      throw new BadGatewayException("Mapbox returned no driving route for these coordinates");
    }

    const distanceM = route.distance;
    const durationSec = Math.round(route.duration);
    return {
      distanceM,
      durationSec,
      geometry: { type: "LineString", coordinates },
      geojson: {
        type: "Feature",
        properties: { distanceM, durationSec },
        geometry: { type: "LineString", coordinates },
      },
    };
  }

  async reverseGeocode(point: MapPoint): Promise<ReverseGeocodeResult | null> {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return null;
    }
    const token = this.requireToken();
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${point.lng},${point.lat}.json`,
    );
    url.searchParams.set("limit", "1");
    url.searchParams.set("types", "address,place,locality,neighborhood,region,country");
    url.searchParams.set("access_token", token);

    const data = await this.mapboxFetch<{
      features?: Array<{
        place_name?: string;
        text?: string;
        address?: string;
        context?: Array<{ id?: string; text?: string }>;
      }>;
    }>(url);

    const feature = data.features?.[0];
    if (!feature) {
      return {
        street: null,
        city: null,
        region: null,
        country: null,
        placeName: null,
      };
    }

    const context = feature.context ?? [];
    const findCtx = (prefix: string) =>
      context.find((c) => typeof c.id === "string" && c.id.startsWith(prefix))?.text ??
      null;

    const street =
      feature.address && feature.text
        ? `${feature.address} ${feature.text}`
        : feature.text ?? null;

    return {
      street,
      city: findCtx("place") ?? findCtx("locality"),
      region: findCtx("region"),
      country: findCtx("country"),
      placeName: feature.place_name ?? null,
    };
  }

  private secretToken(): string | undefined {
    const fromTelematics = this.config.get<TelematicsConfig>("telematics")?.mapboxSecretToken;
    const raw = fromTelematics ?? process.env.MAPBOX_SECRET_TOKEN ?? "";
    const token = raw.trim();
    return token.length > 0 ? token : undefined;
  }

  private requireToken(): string {
    const token = this.secretToken();
    if (!token) {
      throw new ServiceUnavailableException(
        "Mapbox is not configured (MAPBOX_SECRET_TOKEN missing)",
      );
    }
    if (token.startsWith("pk.")) {
      throw new ServiceUnavailableException(
        "MAPBOX_SECRET_TOKEN must be a secret token (sk.*), not a public token",
      );
    }
    return token;
  }

  private async mapboxFetch<T>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (err) {
      this.logger.warn(`Mapbox request failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException("Failed to reach Mapbox");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableException("Mapbox token rejected — check MAPBOX_SECRET_TOKEN");
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Mapbox rate limit exceeded",
          retryAfterSec: retryAfter ? Number(retryAfter) : undefined,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn(`Mapbox HTTP ${response.status}: ${body.slice(0, 200)}`);
      throw new BadGatewayException(`Mapbox error (${response.status})`);
    }

    return (await response.json()) as T;
  }
}
