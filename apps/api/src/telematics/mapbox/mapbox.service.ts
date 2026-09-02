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
  postalCode: string | null;
  placeName: string | null;
}

export interface ForwardGeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
}

/// A single city/place suggestion returned by suggestPlaces.
export interface PlaceSuggestion {
  /// Provider feature ID.
  id: string;
  /// Primary display name — street+number for address results, city name for place results.
  name: string;
  /// City name when available (may differ from `name` for address-level results).
  city: string | null;
  /// Postal / ZIP code when the provider supplies it.
  postalCode: string | null;
  /// Administrative region / state (may be null).
  region: string | null;
  /// Country name (e.g. "Uzbekistan").
  countryName: string | null;
  /// Full human-readable place name from the provider.
  placeName: string | null;
  /// WGS-84 latitude of the result.
  lat: number;
  /// WGS-84 longitude of the result.
  lng: number;
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

  /// Forward geocode: address/place string → lat/lng. Returns null when Mapbox
  /// is unconfigured, when the query produces no result, or on network errors —
  /// callers must treat null as "geocoding unavailable" and leave coords empty.
  async forwardGeocode(
    query: string,
    options?: { country?: string; proximity?: MapPoint },
  ): Promise<ForwardGeocodeResult | null> {
    if (!this.isConfigured()) return null;
    if (!query.trim()) return null;
    const token = this.requireToken();

    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json`,
    );
    url.searchParams.set("limit", "1");
    url.searchParams.set("types", "address,poi,place");
    if (options?.country) url.searchParams.set("country", options.country);
    if (options?.proximity) {
      url.searchParams.set("proximity", `${options.proximity.lng},${options.proximity.lat}`);
    }
    url.searchParams.set("access_token", token);

    const data = await this.mapboxFetch<{
      features?: Array<{
        place_name?: string;
        center?: [number, number];
      }>;
    }>(url);

    const feature = data.features?.[0];
    if (!feature?.center || feature.center.length < 2) return null;

    return {
      lat: feature.center[1],
      lng: feature.center[0],
      placeName: feature.place_name ?? query,
    };
  }

  /// City/place autocomplete — returns up to `limit` suggestions matching
  /// the query prefix, optionally restricted to a single country (ISO alpha-2).
  /// Returns an empty array when Mapbox is unconfigured or the query is empty,
  /// so callers can safely render a free-text fallback without special-casing.
  async suggestPlaces(
    query: string,
    options?: { country?: string; limit?: number },
  ): Promise<PlaceSuggestion[]> {
    if (!this.isConfigured()) return [];
    if (!query.trim()) return [];
    const token = this.requireToken();

    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json`,
    );
    url.searchParams.set("autocomplete", "true");
    url.searchParams.set("limit", String(options?.limit ?? 5));
    // place = city, locality = town/district inside a city — both are useful
    url.searchParams.set("types", "place,locality");
    if (options?.country) {
      // Mapbox expects lowercase ISO alpha-2 for the country filter
      url.searchParams.set("country", options.country.toLowerCase());
    }
    url.searchParams.set("access_token", token);

    const data = await this.mapboxFetch<{
      features?: Array<{
        id?: string;
        text?: string;
        place_name?: string;
        center?: [number, number];
        context?: Array<{ id?: string; text?: string }>;
      }>;
    }>(url);

    return (data.features ?? [])
      .filter((f) => f.text && f.center?.length === 2)
      .map((f) => {
        const context = f.context ?? [];
        const findCtx = (prefix: string) =>
          context.find((c) => typeof c.id === "string" && c.id.startsWith(prefix))?.text ?? null;
        return {
          id: f.id ?? f.text ?? "",
          name: f.text!,
          city: null,
          postalCode: null,
          region: findCtx("region"),
          countryName: findCtx("country"),
          placeName: f.place_name ?? null,
          lat: f.center![1],
          lng: f.center![0],
        };
      });
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
    // Include postcode so we can populate the postal code field on customer forms.
    url.searchParams.set("types", "address,place,locality,neighborhood,region,country,postcode");
    url.searchParams.set("access_token", token);

    const data = await this.mapboxFetch<{
      features?: Array<{
        place_type?: string[];
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
        postalCode: null,
        placeName: null,
      };
    }

    const context = feature.context ?? [];
    const findCtx = (prefix: string) =>
      context.find((c) => typeof c.id === "string" && c.id.startsWith(prefix))?.text ??
      null;

    const placeTypes = feature.place_type ?? [];
    const isAddress = placeTypes.includes("address");

    // Only put a value into `street` when the feature is a street-address type.
    // For city/place/locality/region features the top-level `text` is the place
    // name, not a street — putting it into `street` is semantically wrong.
    let street: string | null = null;
    let city: string | null = null;

    if (isAddress) {
      // feature.address = house/building number, feature.text = street name
      street = feature.address && feature.text
        ? `${feature.address} ${feature.text}`
        : (feature.text ?? null);
      // City comes from context
      city = findCtx("place") ?? findCtx("locality");
    } else if (placeTypes.includes("place") || placeTypes.includes("locality")) {
      // The top-level feature IS the city/place
      street = null;
      city = feature.text ?? findCtx("place") ?? findCtx("locality");
    } else {
      // neighborhood, district, region, postcode, country — city from context only
      street = null;
      city = findCtx("place") ?? findCtx("locality");
    }

    return {
      street,
      city,
      region: findCtx("region"),
      country: findCtx("country"),
      postalCode: findCtx("postcode"),
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
