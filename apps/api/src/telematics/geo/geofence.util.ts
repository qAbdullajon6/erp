import { haversineMeters, isValidCoordinate, type LatLng } from "./haversine.util";

/// Point-in-geofence tests, decoupled from the Prisma row shape so they can be
/// unit-tested with plain objects and reused by both the live ingestion path
/// and any batch re-evaluation.

export interface CircleShape {
  type: "CIRCLE";
  centerLat: number;
  centerLng: number;
  radiusM: number;
}

export interface PolygonShape {
  type: "POLYGON";
  /// Ordered ring of vertices. The ring is treated as closed: the last vertex
  /// is implicitly joined back to the first, so callers need not repeat it.
  vertices: LatLng[];
}

export type GeofenceShape = CircleShape | PolygonShape;

/// Whether a point lies within `radiusM` metres of the circle's centre.
export function isInsideCircle(point: LatLng, circle: CircleShape): boolean {
  if (!isValidCoordinate(point) || !Number.isFinite(circle.radiusM) || circle.radiusM <= 0) {
    return false;
  }
  const center = { latitude: circle.centerLat, longitude: circle.centerLng };
  if (!isValidCoordinate(center)) return false;
  return haversineMeters(point, center) <= circle.radiusM;
}

/// Ray-casting point-in-polygon.
///
/// We test in raw lat/lng degrees rather than projecting to metres first. That
/// is correct for the containment question — the ray-crossing parity is
/// topological, not metric — and a projection would only add cost and a
/// choice of projection. The known caveat is a polygon that straddles the
/// ±180° antimeridian, which this does not special-case; documented as a
/// deliberate limitation because fleet geofences are depots and yards, not
/// ocean-spanning regions.
export function isInsidePolygon(point: LatLng, polygon: PolygonShape): boolean {
  const ring = polygon.vertices;
  if (!isValidCoordinate(point) || !Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  const x = point.longitude;
  const y = point.latitude;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].longitude;
    const yi = ring[i].latitude;
    const xj = ring[j].longitude;
    const yj = ring[j].latitude;

    // Does the horizontal ray from the point cross edge (j -> i)?
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

export function isInsideGeofence(point: LatLng, shape: GeofenceShape): boolean {
  return shape.type === "CIRCLE"
    ? isInsideCircle(point, shape)
    : isInsidePolygon(point, shape);
}

/// Parses a persisted geofence row (Prisma `Json` polygon, nullable circle
/// fields) into a strict shape, or null when the row is malformed — a geofence
/// missing its geometry must never silently match or reject every point, so
/// callers skip a null shape rather than treating it as empty.
export function toGeofenceShape(row: {
  type: "CIRCLE" | "POLYGON";
  centerLat: number | null;
  centerLng: number | null;
  radiusM: number | null;
  polygon: unknown;
}): GeofenceShape | null {
  if (row.type === "CIRCLE") {
    if (row.centerLat == null || row.centerLng == null || row.radiusM == null) return null;
    return { type: "CIRCLE", centerLat: row.centerLat, centerLng: row.centerLng, radiusM: row.radiusM };
  }

  if (!Array.isArray(row.polygon)) return null;
  const vertices: LatLng[] = [];
  for (const raw of row.polygon) {
    if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as Record<string, unknown>).lat === "number" &&
      typeof (raw as Record<string, unknown>).lng === "number"
    ) {
      const v = raw as { lat: number; lng: number };
      vertices.push({ latitude: v.lat, longitude: v.lng });
    } else {
      return null;
    }
  }
  if (vertices.length < 3) return null;
  return { type: "POLYGON", vertices };
}
