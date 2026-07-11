import { useQuery } from '@tanstack/react-query';
import { describeError } from './describe-error';
import { unwrapResponse } from './error';
import { apiFetch } from './fetch';
import { availabilityKeys } from './query-keys';

/// The canonical availability source (AR4).
///
/// GET /dispatch/availability is the ONLY thing that may answer "who can take this
/// trip?". It is backed by AssignmentQueries, which is the same code
/// AssignmentPolicy consults before accepting an assignment — so what this returns
/// is exactly what the backend will accept.
///
/// Screens must NOT work this out for themselves. Filtering the drivers list by
/// `status === 'ACTIVE'` looks like availability and is not: Driver.status is an
/// administrative field ("is this person employed?"), and it says nothing about
/// whether they are already booked for those dates. Every assignment dialog used to
/// do exactly that, which is why the UI happily offered drivers the API then
/// rejected with a 409.

export interface AvailableDriver {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
}

export interface AvailableVehicle {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  type: string;
  capacityKg: string | null;
  capacityM3: string | null;
  status: string;
}

export interface AvailabilityResponse {
  drivers: AvailableDriver[];
  vehicles: AvailableVehicle[];
}

class AvailabilityAPI {
  private baseUrl = '/api';

  /// Without a window this is only the administrative snapshot (active drivers,
  /// available vehicles). WITH a window it additionally excludes everyone already
  /// committed to an overlapping trip — which is the answer you actually want
  /// before assigning.
  async get(window?: { pickupDate?: string; deliveryDate?: string }): Promise<AvailabilityResponse> {
    const params = new URLSearchParams();
    if (window?.pickupDate) params.set('pickupDate', window.pickupDate);
    if (window?.deliveryDate) params.set('deliveryDate', window.deliveryDate);
    const qs = params.toString();

    const response = await apiFetch(
      `${this.baseUrl}/dispatch/availability${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
    );
    return unwrapResponse<AvailabilityResponse>(response, 'Failed to load availability');
  }
}

export const availabilityAPI = new AvailabilityAPI();

/// Who may be assigned to a trip in this window.
///
/// Pass both dates or neither — a half-specified window is ignored by the API, and
/// asking "who is free between <undefined> and <undefined>" would silently give you
/// the unfiltered list, which is the very bug this hook exists to prevent. The query
/// therefore stays disabled until it has a real window.
///
/// Kept deliberately fresh: this is the one answer that goes stale because of what
/// SOMEBODY ELSE did. Every operational mutation invalidates it (see invalidate.ts),
/// but another dispatcher can book the same driver between your render and your
/// click, so it is also refetched on focus rather than trusted for minutes.
export function useAvailability(window?: { pickupDate?: string; deliveryDate?: string }) {
  const enabled = Boolean(window?.pickupDate && window?.deliveryDate);

  const result = useQuery({
    queryKey: availabilityKeys.window(window),
    queryFn: () => availabilityAPI.get(window),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return {
    data: result.data ?? null,
    loading: enabled && result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load availability') : null,
    refetch: result.refetch,
  };
}
