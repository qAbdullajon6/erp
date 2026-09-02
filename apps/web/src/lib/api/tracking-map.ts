import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse as unwrap } from './error';
import { describeError } from './describe-error';
import { quantizeMapPoint } from '@/components/fleet-tracking/fleet-tracking-hardening';

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  distanceM: number;
  durationSec: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  geojson: {
    type: 'Feature';
    properties: {
      distanceM: number;
      durationSec: number;
    };
    geometry: {
      type: 'LineString';
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

class TrackingMapAPI {
  private baseUrl = '/api';

  async status(): Promise<{ configured: boolean; provider: string }> {
    const res = await apiFetch(`${this.baseUrl}/tracking/map/status`, {
      method: 'GET',
    });
    return unwrap(res, 'Failed to load map status');
  }

  async directions(input: {
    origin: MapPoint;
    destination: MapPoint;
    waypoints?: MapPoint[];
  }): Promise<DirectionsResult> {
    const res = await apiFetch(`${this.baseUrl}/tracking/map/directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return unwrap(res, 'Failed to load directions');
  }

  async reverseGeocode(point: MapPoint): Promise<ReverseGeocodeResult> {
    const qs = new URLSearchParams({
      lat: String(point.lat),
      lng: String(point.lng),
    });
    const res = await apiFetch(
      `${this.baseUrl}/tracking/map/reverse-geocode?${qs}`,
      { method: 'GET' },
    );
    return unwrap(res, 'Failed to reverse geocode');
  }
}

export const trackingMapAPI = new TrackingMapAPI();

export const trackingMapKeys = {
  all: ['tracking-map'] as const,
  status: () => [...trackingMapKeys.all, 'status'] as const,
  directions: (input: {
    origin: MapPoint;
    destination: MapPoint;
    waypoints?: MapPoint[];
  }) => [...trackingMapKeys.all, 'directions', input] as const,
  reverse: (point: MapPoint) =>
    [...trackingMapKeys.all, 'reverse', point] as const,
};

export function useTrackingMapStatus() {
  return useQuery({
    queryKey: trackingMapKeys.status(),
    queryFn: () => trackingMapAPI.status(),
    staleTime: 60_000,
  });
}

export function useDirectionsQuery(
  input: {
    origin: MapPoint | null;
    destination: MapPoint | null;
    waypoints?: MapPoint[];
  },
  opts?: { enabled?: boolean },
) {
  const enabled =
    (opts?.enabled ?? true) &&
    input.origin != null &&
    input.destination != null &&
    Number.isFinite(input.origin.lat) &&
    Number.isFinite(input.origin.lng) &&
    Number.isFinite(input.destination.lat) &&
    Number.isFinite(input.destination.lng);

  const quantized = enabled
    ? {
        origin: quantizeMapPoint(input.origin!),
        destination: quantizeMapPoint(input.destination!),
        waypoints: input.waypoints?.map((w) => quantizeMapPoint(w)),
      }
    : null;

  const result = useQuery({
    queryKey: trackingMapKeys.directions(
      quantized ?? {
        origin: { lat: 0, lng: 0 },
        destination: { lat: 0, lng: 0 },
        waypoints: input.waypoints,
      },
    ),
    queryFn: () =>
      trackingMapAPI.directions({
        origin: quantized!.origin,
        destination: quantized!.destination,
        waypoints: quantized!.waypoints,
      }),
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      const message = describeError(error, '');
      if (message.toLowerCase().includes('rate limit')) {
        return failureCount < 2;
      }
      return failureCount < 1;
    },
    retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 15_000),
  });

  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to load directions')
      : null,
  };
}

export function useReverseGeocodeQuery(
  point: MapPoint | null,
  opts?: { enabled?: boolean },
) {
  const enabled =
    (opts?.enabled ?? true) &&
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng);

  const quantized = enabled && point ? quantizeMapPoint(point) : null;

  const result = useQuery({
    queryKey: trackingMapKeys.reverse(quantized ?? { lat: 0, lng: 0 }),
    queryFn: () => trackingMapAPI.reverseGeocode(quantized!),
    enabled: enabled && quantized != null,
    staleTime: 120_000,
  });

  return {
    ...result,
    errorMessage: result.error
      ? describeError(result.error, 'Failed to reverse geocode')
      : null,
  };
}
