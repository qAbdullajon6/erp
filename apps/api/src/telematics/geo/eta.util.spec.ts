import {
  computeEta,
  DEFAULT_FALLBACK_SPEED_KPH,
  effectiveSpeedKph,
  remainingKm,
} from "./eta.util";

describe("eta.util", () => {
  const current = { latitude: 41.3, longitude: 69.24 };
  const destination = { latitude: 41.4, longitude: 69.24 }; // ~11 km due north

  describe("remainingKm", () => {
    it("scales straight-line distance by the winding factor", () => {
      const straight = remainingKm({ current, destination, windingFactor: 1 });
      const wound = remainingKm({ current, destination, windingFactor: 1.3 });
      expect(wound).toBeCloseTo(straight * 1.3, 5);
    });

    it("sums along supplied waypoints", () => {
      const viaWaypoint = remainingKm({
        current,
        destination,
        windingFactor: 1,
        remainingWaypoints: [{ latitude: 41.35, longitude: 69.30 }],
      });
      const direct = remainingKm({ current, destination, windingFactor: 1 });
      // A detour is at least as long as the direct leg.
      expect(viaWaypoint).toBeGreaterThan(direct);
    });
  });

  describe("effectiveSpeedKph", () => {
    it("uses a meaningful live speed", () => {
      expect(effectiveSpeedKph({ current, destination, recentSpeedKph: 60 })).toBe(60);
    });

    it("falls back to the average when stopped at a light", () => {
      expect(
        effectiveSpeedKph({ current, destination, recentSpeedKph: 0, avgSpeedKph: 45 }),
      ).toBe(45);
    });

    it("falls back to the urban default when neither is usable", () => {
      expect(
        effectiveSpeedKph({ current, destination, recentSpeedKph: 0, avgSpeedKph: 0 }),
      ).toBe(DEFAULT_FALLBACK_SPEED_KPH);
    });
  });

  describe("computeEta", () => {
    it("produces a finite ETA and future arrival time", () => {
      const now = new Date("2026-07-17T10:00:00.000Z");
      const result = computeEta({ current, destination, recentSpeedKph: 60, windingFactor: 1, now });
      expect(result.effectiveSpeedKph).toBe(60);
      expect(result.remainingKm).toBeGreaterThan(10);
      expect(result.etaSeconds).toBeGreaterThan(0);
      expect(result.etaAt.getTime()).toBe(now.getTime() + result.etaSeconds * 1000);
    });

    it("never divides by zero when there is no usable speed and distance is zero", () => {
      const result = computeEta({ current, destination: current, recentSpeedKph: 60 });
      expect(result.remainingKm).toBe(0);
      expect(result.etaSeconds).toBe(0);
    });
  });
});
