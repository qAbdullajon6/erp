/// Shared interface for geocoding providers used by the customer address flow.
/// Both forward suggestions and reverse geocoding are covered.
/// The controller depends only on this interface — never on a concrete provider.

import type {
  PlaceSuggestion,
  ReverseGeocodeResult,
} from "../telematics/mapbox/mapbox.service";

export { PlaceSuggestion, ReverseGeocodeResult };

export interface GeocodingProvider {
  /// True when the provider's API credentials are present.
  /// Returns false gracefully — callers should treat unconfigured as
  /// "feature unavailable", not an error.
  isConfigured(): boolean;

  /// Forward address/place suggestions.
  /// `country` is an optional ISO 3166-1 alpha-2 code (e.g. "uz").
  /// When absent the provider searches globally.
  suggestPlaces(
    query: string,
    options?: { country?: string; limit?: number },
  ): Promise<PlaceSuggestion[]>;

  /// Reverse-geocode a lat/lng to a structured address.
  /// Returns null when the provider is unconfigured or no result is found.
  reverseGeocode(point: { lat: number; lng: number }): Promise<ReverseGeocodeResult | null>;
}

/// NestJS injection token for the provider — the controller injects this
/// symbol, never the concrete class.
export const GEOCODING_PROVIDER = Symbol("GeocodingProvider");
