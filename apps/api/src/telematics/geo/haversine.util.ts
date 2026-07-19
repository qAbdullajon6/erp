/// Great-circle geometry on the WGS-84 sphere.
///
/// Everything spatial in telematics — distance rollups, speed-from-fixes,
/// geofence radius tests, ETA — reduces to two operations: the metres between
/// two lat/lng points, and the bearing from one to the next. They live here as
/// pure functions so they are unit-testable without a database and reused
/// rather than re-derived at each call site.
///
/// The sphere (not the ellipsoid) is deliberate: at the scale a truck moves
/// between two GPS fixes a few seconds apart, the haversine error versus
/// Vincenty is centimetres — far below GPS noise — and it never fails to
/// converge the way Vincenty can near-antipodally.

/// Mean Earth radius in metres (IUGG).
export const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLng {
  latitude: number;
  longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/// True when both coordinates are finite and within valid lat/lng ranges. A
/// GPS unit with no fix often reports (0, 0) — the "null island" — which is a
/// valid coordinate but almost never a real position, so callers that want to
/// reject it must do so explicitly; this only rejects the physically impossible.
export function isValidCoordinate(point: LatLng): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/// Straight-line surface distance between two points, in metres.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}

/// Initial bearing (forward azimuth) from `a` to `b`, in degrees clockwise from
/// true north, normalised to [0, 360). The bearing of a zero-length segment is
/// undefined; we return 0 rather than NaN so downstream heading fields stay
/// numeric.
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const theta = Math.atan2(y, x);

  return (toDegrees(theta) + 360) % 360;
}

/// Speed in km/h implied by two fixes and the seconds between them. Returns 0
/// for a non-positive interval (duplicate timestamps, clock skew) rather than
/// Infinity — a divide-by-zero here would poison every max/avg speed rollup.
export function speedKphBetween(a: LatLng, b: LatLng, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const meters = haversineMeters(a, b);
  return (meters / seconds) * 3.6;
}

/// Total path length of an ordered polyline, in kilometres. Skips any segment
/// whose endpoint is not a valid coordinate so one bad fix does not corrupt the
/// whole trip distance.
export function pathLengthKm(points: LatLng[]): number {
  let meters = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (isValidCoordinate(prev) && isValidCoordinate(curr)) {
      meters += haversineMeters(prev, curr);
    }
  }
  return meters / 1000;
}
