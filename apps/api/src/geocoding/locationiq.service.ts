import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  GeocodingProvider,
  PlaceSuggestion,
  ReverseGeocodeResult,
} from "./geocoding-provider.interface";

/// LocationIQ raw autocomplete result shape.
/// https://locationiq.com/docs#autocomplete
interface LiqAutocompleteItem {
  place_id: string;
  display_name?: string;
  /// The "place" portion of display_name — clean primary label for the result.
  display_place?: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  address?: LiqAddress;
}

/// LocationIQ raw reverse-geocode result shape.
/// https://locationiq.com/docs#reverse-geocoding
interface LiqReverseResult {
  place_id?: string;
  display_name?: string;
  lat: string;
  lon: string;
  address?: LiqAddress;
}

/// Full set of address components that LocationIQ may return,
/// including normalised fields emitted when normalizeaddress=1.
interface LiqAddress {
  // Street-level (reverse geocode)
  road?: string;
  house_number?: string;
  building?: string;
  // Street-level (autocomplete — highway/residential results use `name` not `road`)
  name?: string;
  // Sub-city
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  // City hierarchy (order of preference: city > municipality > town > village)
  city?: string;
  municipality?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  // Region / state
  state?: string;
  state_district?: string;
  // Country
  country?: string;
  country_code?: string;
  // Postal
  postcode?: string;
}

@Injectable()
export class LocationIQService implements GeocodingProvider {
  private readonly logger = new Logger(LocationIQService.name);

  /// EU endpoint — lower latency to Central Asia; full OSM coverage for UZ.
  private readonly baseUrl = "https://eu1.locationiq.com/v1";

  isConfigured(): boolean {
    return Boolean(process.env.LOCATIONIQ_API_KEY?.trim());
  }

  async suggestPlaces(
    query: string,
    options?: { country?: string; limit?: number },
  ): Promise<PlaceSuggestion[]> {
    if (!query.trim()) return [];
    const key = this.requireKey();

    const url = new URL(`${this.baseUrl}/autocomplete`);
    url.searchParams.set("q", query.trim());
    url.searchParams.set("key", key);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(options?.limit ?? 5));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("dedupe", "1");
    // English-first: use English display names where OSM has translations.
    url.searchParams.set("accept-language", "en");
    if (options?.country) {
      url.searchParams.set("countrycodes", options.country.toLowerCase());
    }

    const items = await this.liqFetch<LiqAutocompleteItem[]>(url);
    return (items ?? []).map((item) => this.toPlaceSuggestion(item));
  }

  async reverseGeocode(point: {
    lat: number;
    lng: number;
  }): Promise<ReverseGeocodeResult | null> {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return null;
    }
    const key = this.requireKey();

    const url = new URL(`${this.baseUrl}/reverse`);
    url.searchParams.set("lat", String(point.lat));
    url.searchParams.set("lon", String(point.lng));
    url.searchParams.set("key", key);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    // English-first: prefer English OSM names / translations.
    url.searchParams.set("accept-language", "en");
    // zoom=18 → building/entrance level detail (most precise street + house_number).
    url.searchParams.set("zoom", "18");
    // normalizeaddress=1 → LocationIQ normalises inconsistent address fields
    // (e.g. hamlet → city) for consistent parsing downstream.
    url.searchParams.set("normalizeaddress", "1");
    // normalizecity=1 → city is set even when only town/village/hamlet is available.
    url.searchParams.set("normalizecity", "1");

    const result = await this.liqFetch<LiqReverseResult>(url);
    if (!result) return null;
    return this.toReverseGeocodeResult(result);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private requireKey(): string {
    const key = process.env.LOCATIONIQ_API_KEY?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        "LOCATIONIQ_API_KEY is not configured — add it to your .env file",
      );
    }
    return key;
  }

  /// Map a LocationIQ autocomplete item to the shared PlaceSuggestion shape.
  private toPlaceSuggestion(item: LiqAutocompleteItem): PlaceSuggestion {
    const addr = item.address ?? {};

    // Build a concise street/place name.
    //
    // Reverse-geocode style: `addr.road` is the canonical street field.
    // Autocomplete highway results: LocationIQ puts the street in `addr.name`
    //   (not `addr.road`), so fall through to name.
    // For address-level results with a house number, prefix it.
    // For city/POI results: use `display_place` (LIQ's clean primary label)
    //   or the first comma segment of display_name as last resort.
    const streetField = addr.road ?? addr.name ?? null;
    let name: string;
    if (streetField) {
      name = addr.house_number
        ? `${addr.house_number} ${streetField}`
        : streetField;
    } else {
      name = item.display_place ?? item.display_name?.split(",")[0]?.trim() ?? "";
    }

    const city = this.resolveCity(addr);

    return {
      id: item.place_id,
      name,
      city,
      postalCode: addr.postcode ?? null,
      region: addr.state ?? addr.state_district ?? null,
      countryName: addr.country ?? null,
      placeName: item.display_name ?? null,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    };
  }

  /// Map a LocationIQ reverse-geocode result to the shared ReverseGeocodeResult.
  private toReverseGeocodeResult(result: LiqReverseResult): ReverseGeocodeResult {
    const addr = result.address ?? {};

    // Street: road only (never a city/place name). Include house_number if present.
    // If LocationIQ does not provide a road for this coordinate, street stays null.
    const road = addr.road ?? null;
    const street = road
      ? (addr.house_number ? `${addr.house_number} ${road}` : road)
      : null;

    const city = this.resolveCity(addr);

    return {
      street,
      city,
      region: addr.state ?? addr.state_district ?? null,
      country: addr.country ?? null,
      postalCode: addr.postcode ?? null,
      placeName: result.display_name ?? null,
    };
  }

  /// Resolve the best city name from the address components.
  /// With normalizecity=1 on reverse requests, LocationIQ promotes town/village
  /// to `city`, so this fallback chain mainly matters for autocomplete results
  /// which don't receive that normalisation param.
  private resolveCity(addr: LiqAddress): string | null {
    return (
      addr.city ??
      addr.municipality ??
      addr.town ??
      addr.village ??
      addr.hamlet ??
      null
    );
  }

  private async liqFetch<T>(url: URL): Promise<T | null> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          // Also send the HTTP Accept-Language header as a belt-and-suspenders
          // measure alongside the accept-language query param.
          "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.warn(
        `LocationIQ request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadGatewayException("Failed to reach LocationIQ geocoding service");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableException(
        "LocationIQ rejected the API key — check LOCATIONIQ_API_KEY",
      );
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "LocationIQ rate limit exceeded",
          retryAfterSec: retryAfter ? Number(retryAfter) : undefined,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn(`LocationIQ HTTP ${response.status}: ${body.slice(0, 200)}`);
      throw new BadGatewayException(`LocationIQ error (${response.status})`);
    }

    return (await response.json()) as T;
  }
}
