import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export interface PlaceSuggestion {
  id: string;
  /** Primary display name — street+number for address results, city name for place results. */
  name: string;
  /** City name when available (may differ from `name` for address-level results). */
  city: string | null;
  /** Postal / ZIP code when the provider supplies it. */
  postalCode: string | null;
  region: string | null;
  countryName: string | null;
  /** Full human-readable place name from the provider. */
  placeName: string | null;
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  street: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  placeName: string | null;
}

class GeocodingAPI {
  private base = '/api';

  async suggestPlaces(
    q: string,
    options?: { country?: string; limit?: number },
  ): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({ q });
    if (options?.country) params.set('country', options.country);
    if (options?.limit) params.set('limit', String(options.limit));
    const res = await apiFetch(`${this.base}/geocoding/suggest?${params}`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load place suggestions');
  }

  async reverseGeocode(point: { lat: number; lng: number }): Promise<ReverseGeocodeResult> {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lng: String(point.lng),
    });
    const res = await apiFetch(`${this.base}/geocoding/reverse?${params}`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to reverse geocode location');
  }
}

export const geocodingAPI = new GeocodingAPI();

/** Debounced city/place suggestions for the CitySelect component.
 *  countryCode is required — keeps results focused to one country. */
export function usePlaceSuggestions(
  query: string,
  countryCode: string | null | undefined,
) {
  const debounced = useDebouncedValue(query, 300);
  const enabled = debounced.trim().length >= 2 && Boolean(countryCode?.trim());

  const result = useQuery<PlaceSuggestion[]>({
    queryKey: ['place-suggest', debounced.trim(), countryCode?.toUpperCase()],
    queryFn: () =>
      geocodingAPI.suggestPlaces(debounced.trim(), {
        country: countryCode ?? undefined,
        limit: 6,
      }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: [],
    retry: false,
  });

  return {
    suggestions: result.data ?? [],
    loading: result.isFetching,
    configured: !result.isError,
  };
}

/** Debounced street-address suggestions for the AddressSearch component.
 *  countryCode optional but strongly recommended to scope results. */
export function useAddressSuggestions(
  query: string,
  countryCode: string | null | undefined,
) {
  const debounced = useDebouncedValue(query, 350);
  const enabled = debounced.trim().length >= 2;

  const result = useQuery<PlaceSuggestion[]>({
    queryKey: ['address-suggest', debounced.trim(), countryCode?.toUpperCase() ?? 'ALL'],
    queryFn: () =>
      geocodingAPI.suggestPlaces(debounced.trim(), {
        country: countryCode ?? undefined,
        limit: 7,
      }),
    enabled,
    staleTime: 30_000,
    gcTime: 3 * 60_000,
    placeholderData: [],
    retry: false,
  });

  return {
    suggestions: result.data ?? [],
    loading: result.isFetching,
    configured: !result.isError,
  };
}
