import {
  isInsideCircle,
  isInsideGeofence,
  isInsidePolygon,
  toGeofenceShape,
  type CircleShape,
  type PolygonShape,
} from "./geofence.util";

describe("geofence.util", () => {
  describe("isInsideCircle", () => {
    const depot: CircleShape = {
      type: "CIRCLE",
      centerLat: 41.3,
      centerLng: 69.24,
      radiusM: 500,
    };

    it("is inside at the exact centre", () => {
      expect(isInsideCircle({ latitude: 41.3, longitude: 69.24 }, depot)).toBe(true);
    });

    it("is inside a point ~100 m away", () => {
      expect(isInsideCircle({ latitude: 41.3009, longitude: 69.24 }, depot)).toBe(true);
    });

    it("is outside a point ~2 km away", () => {
      expect(isInsideCircle({ latitude: 41.318, longitude: 69.24 }, depot)).toBe(false);
    });

    it("rejects a zero or negative radius", () => {
      expect(isInsideCircle({ latitude: 41.3, longitude: 69.24 }, { ...depot, radiusM: 0 })).toBe(false);
    });
  });

  describe("isInsidePolygon", () => {
    // A unit square from (0,0) to (1,1) in lat/lng.
    const square: PolygonShape = {
      type: "POLYGON",
      vertices: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 0 },
      ],
    };

    it("contains an interior point", () => {
      expect(isInsidePolygon({ latitude: 0.5, longitude: 0.5 }, square)).toBe(true);
    });

    it("excludes an exterior point", () => {
      expect(isInsidePolygon({ latitude: 1.5, longitude: 0.5 }, square)).toBe(false);
      expect(isInsidePolygon({ latitude: 0.5, longitude: 2 }, square)).toBe(false);
    });

    it("handles a concave (L-shaped) polygon correctly", () => {
      const lShape: PolygonShape = {
        type: "POLYGON",
        vertices: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 2 },
          { latitude: 1, longitude: 2 },
          { latitude: 1, longitude: 1 },
          { latitude: 2, longitude: 1 },
          { latitude: 2, longitude: 0 },
        ],
      };
      // Inside the vertical arm of the L.
      expect(isInsidePolygon({ latitude: 1.5, longitude: 0.5 }, lShape)).toBe(true);
      // In the notch that was cut away — outside.
      expect(isInsidePolygon({ latitude: 1.5, longitude: 1.5 }, lShape)).toBe(false);
    });

    it("rejects a degenerate polygon with fewer than 3 vertices", () => {
      expect(
        isInsidePolygon(
          { latitude: 0.5, longitude: 0.5 },
          { type: "POLYGON", vertices: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }] },
        ),
      ).toBe(false);
    });
  });

  describe("isInsideGeofence", () => {
    it("dispatches on shape type", () => {
      const circle: CircleShape = { type: "CIRCLE", centerLat: 0, centerLng: 0, radiusM: 1000 };
      expect(isInsideGeofence({ latitude: 0, longitude: 0 }, circle)).toBe(true);
    });
  });

  describe("toGeofenceShape", () => {
    it("parses a circle row", () => {
      const shape = toGeofenceShape({
        type: "CIRCLE",
        centerLat: 41.3,
        centerLng: 69.24,
        radiusM: 500,
        polygon: null,
      });
      expect(shape).toEqual({ type: "CIRCLE", centerLat: 41.3, centerLng: 69.24, radiusM: 500 });
    });

    it("returns null for a circle row missing geometry", () => {
      expect(
        toGeofenceShape({ type: "CIRCLE", centerLat: null, centerLng: 69.24, radiusM: 500, polygon: null }),
      ).toBeNull();
    });

    it("parses a polygon row of {lat,lng} objects", () => {
      const shape = toGeofenceShape({
        type: "POLYGON",
        centerLat: null,
        centerLng: null,
        radiusM: null,
        polygon: [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 1 },
          { lat: 1, lng: 1 },
        ],
      });
      expect(shape).toEqual({
        type: "POLYGON",
        vertices: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 1 },
          { latitude: 1, longitude: 1 },
        ],
      });
    });

    it("returns null for a malformed polygon", () => {
      expect(
        toGeofenceShape({
          type: "POLYGON",
          centerLat: null,
          centerLng: null,
          radiusM: null,
          polygon: [{ lat: 0 }, { lat: 1, lng: 1 }],
        }),
      ).toBeNull();
    });
  });
});
