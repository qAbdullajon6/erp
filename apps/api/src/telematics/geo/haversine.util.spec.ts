import {
  bearingDegrees,
  haversineKm,
  haversineMeters,
  isValidCoordinate,
  pathLengthKm,
  speedKphBetween,
} from "./haversine.util";

// Reference points with distances independently verified against the NOAA
// great-circle calculator, tolerances chosen well inside GPS noise.
const TASHKENT = { latitude: 41.2995, longitude: 69.2401 };
const SAMARKAND = { latitude: 39.627, longitude: 66.975 };

describe("haversine.util", () => {
  describe("haversineMeters / haversineKm", () => {
    it("is zero between a point and itself", () => {
      expect(haversineMeters(TASHKENT, TASHKENT)).toBe(0);
    });

    it("matches the known Tashkent–Samarkand great-circle distance (~270 km)", () => {
      const km = haversineKm(TASHKENT, SAMARKAND);
      expect(km).toBeGreaterThan(266);
      expect(km).toBeLessThan(274);
    });

    it("is symmetric", () => {
      expect(haversineMeters(TASHKENT, SAMARKAND)).toBeCloseTo(
        haversineMeters(SAMARKAND, TASHKENT),
        6,
      );
    });

    it("approximates 111 km per degree of latitude at the equator", () => {
      const km = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
      expect(km).toBeGreaterThan(110);
      expect(km).toBeLessThan(112);
    });
  });

  describe("bearingDegrees", () => {
    it("returns 0 (north) for a due-north step", () => {
      const b = bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
      expect(b).toBeCloseTo(0, 1);
    });

    it("returns 90 (east) for a due-east step at the equator", () => {
      const b = bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
      expect(b).toBeCloseTo(90, 1);
    });

    it("normalises into [0, 360) for a westward step", () => {
      const b = bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: -1 });
      expect(b).toBeCloseTo(270, 1);
    });

    it("returns 0 rather than NaN for a zero-length segment", () => {
      expect(bearingDegrees(TASHKENT, TASHKENT)).toBe(0);
    });
  });

  describe("speedKphBetween", () => {
    it("computes km/h from distance and time", () => {
      // 1000 m in 60 s = 60 km/h.
      const a = { latitude: 0, longitude: 0 };
      const b = { latitude: 0, longitude: 0.0089932 }; // ~1000 m east at equator
      const kph = speedKphBetween(a, b, 60);
      expect(kph).toBeGreaterThan(58);
      expect(kph).toBeLessThan(62);
    });

    it("returns 0 for a non-positive interval instead of Infinity", () => {
      expect(speedKphBetween(TASHKENT, SAMARKAND, 0)).toBe(0);
      expect(speedKphBetween(TASHKENT, SAMARKAND, -5)).toBe(0);
    });
  });

  describe("isValidCoordinate", () => {
    it("accepts in-range coordinates including null island", () => {
      expect(isValidCoordinate({ latitude: 0, longitude: 0 })).toBe(true);
      expect(isValidCoordinate({ latitude: -90, longitude: 180 })).toBe(true);
    });

    it("rejects out-of-range and non-finite values", () => {
      expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
      expect(isValidCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
      expect(isValidCoordinate({ latitude: NaN, longitude: 0 })).toBe(false);
    });
  });

  describe("pathLengthKm", () => {
    it("sums an ordered polyline", () => {
      const total = pathLengthKm([
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 0, longitude: 2 },
      ]);
      const oneLeg = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
      expect(total).toBeCloseTo(oneLeg * 2, 3);
    });

    it("skips segments touching an invalid fix", () => {
      const total = pathLengthKm([
        { latitude: 0, longitude: 0 },
        { latitude: 999, longitude: 0 }, // invalid — both its segments skipped
        { latitude: 0, longitude: 1 },
      ]);
      expect(total).toBe(0);
    });

    it("is zero for fewer than two points", () => {
      expect(pathLengthKm([])).toBe(0);
      expect(pathLengthKm([TASHKENT])).toBe(0);
    });
  });
});
