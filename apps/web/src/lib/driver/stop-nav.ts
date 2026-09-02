export function buildStopLink(
  address: string,
  city: string,
  lat: string | null | undefined,
  lng: string | null | undefined,
  mode: 'map' | 'navigate',
): string | null {
  if (lat && lng) {
    const coord = `${lat},${lng}`;
    return mode === 'navigate'
      ? `https://www.google.com/maps/dir/?api=1&destination=${coord}`
      : `https://www.google.com/maps/search/?api=1&query=${coord}`;
  }
  const query = [address, city].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  return mode === 'navigate'
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Structural type — matches DriverDispatchStop without importing from the API module.
interface StopForNav {
  stopType: string;
  arrivedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  address: string;
  city: string;
  lat: string | null;
  lng: string | null;
}

/**
 * Returns the intermediate stop the navigation button should point to.
 *
 * AT_STOP  → the stop the driver is currently at: arrivedAt set, not yet departed.
 * IN_TRANSIT → the first unvisited, non-failed INTERMEDIATE stop by stopIndex ASC
 *              (the stops array must already be ordered by stopIndex ASC, as the
 *              DRIVER_INCLUDE query guarantees).
 * All other statuses → null (caller falls back to pickup / delivery nav).
 */
/**
 * Returns the stop the dispatcher should highlight as "currently active" for
 * the given dispatch status.
 *
 * AT_STOP              → the INTERMEDIATE stop the driver has arrived at but not departed
 * IN_TRANSIT           → the first unvisited, non-failed INTERMEDIATE stop; falls back to DELIVERY
 * ARRIVED_AT_DELIVERY
 * DELIVERED            → the DELIVERY stop
 * All other statuses   → null
 */
export function getCurrentDispatchStop(
  status: string,
  stops: StopForNav[],
): StopForNav | null {
  if (status === 'AT_STOP') {
    return (
      stops.find(
        (s) =>
          s.stopType === 'INTERMEDIATE' &&
          s.arrivedAt != null &&
          s.completedAt == null &&
          s.failedAt == null,
      ) ?? null
    );
  }
  if (status === 'IN_TRANSIT') {
    const nextIntermediate = stops.find(
      (s) => s.stopType === 'INTERMEDIATE' && s.arrivedAt == null && s.failedAt == null,
    );
    if (nextIntermediate) return nextIntermediate;
    return stops.find((s) => s.stopType === 'DELIVERY') ?? null;
  }
  if (status === 'ARRIVED_AT_DELIVERY' || status === 'DELIVERED') {
    return stops.find((s) => s.stopType === 'DELIVERY') ?? null;
  }
  return null;
}

export function findNavigationTargetStop(
  status: string,
  stops: StopForNav[],
): StopForNav | null {
  if (status === 'AT_STOP') {
    return (
      stops.find(
        (s) =>
          s.stopType === 'INTERMEDIATE' &&
          s.arrivedAt != null &&
          s.completedAt == null &&
          s.failedAt == null,
      ) ?? null
    );
  }
  if (status === 'IN_TRANSIT') {
    return (
      stops.find(
        (s) =>
          s.stopType === 'INTERMEDIATE' &&
          s.arrivedAt == null &&
          s.failedAt == null,
      ) ?? null
    );
  }
  return null;
}
