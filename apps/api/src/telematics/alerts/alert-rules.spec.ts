import {
  accelerationMs2,
  classifyHarshDriving,
  headingDeltaDeg,
  isSpeeding,
  lateralAccelerationMs2,
  overSpeedKph,
  speedingSeverity,
} from "./alert-rules";

describe("alert-rules", () => {
  describe("overSpeedKph / isSpeeding", () => {
    it("is zero within the limit plus tolerance", () => {
      expect(overSpeedKph(95, 90, 10)).toBe(0);
      expect(isSpeeding(95, 90, 10)).toBe(false);
    });

    it("reports the amount over the effective limit", () => {
      expect(overSpeedKph(115, 90, 10)).toBe(15);
      expect(isSpeeding(115, 90, 10)).toBe(true);
    });

    it("treats a null speed as not speeding", () => {
      expect(isSpeeding(null, 90, 10)).toBe(false);
    });
  });

  describe("speedingSeverity", () => {
    it("bands severity by amount over", () => {
      expect(speedingSeverity(5)).toBe("LOW");
      expect(speedingSeverity(15)).toBe("MEDIUM");
      expect(speedingSeverity(30)).toBe("HIGH");
      expect(speedingSeverity(45)).toBe("CRITICAL");
    });
  });

  describe("accelerationMs2", () => {
    it("is positive for acceleration and negative for braking", () => {
      // 0 -> 36 km/h (10 m/s) in 2 s = 5 m/s².
      expect(accelerationMs2(0, 36, 2)).toBeCloseTo(5, 3);
      expect(accelerationMs2(36, 0, 2)).toBeCloseTo(-5, 3);
    });

    it("guards divide-by-zero", () => {
      expect(accelerationMs2(0, 36, 0)).toBe(0);
    });
  });

  describe("headingDeltaDeg", () => {
    it("takes the short way around the compass", () => {
      expect(headingDeltaDeg(350, 10)).toBe(20);
      expect(headingDeltaDeg(10, 350)).toBe(-20);
      expect(headingDeltaDeg(0, 90)).toBe(90);
    });
  });

  describe("lateralAccelerationMs2", () => {
    it("grows with speed and turn rate", () => {
      const slow = lateralAccelerationMs2(20, 30, 2);
      const fast = lateralAccelerationMs2(60, 30, 2);
      expect(fast).toBeGreaterThan(slow);
      expect(slow).toBeGreaterThan(0);
    });

    it("is zero without a turn", () => {
      expect(lateralAccelerationMs2(60, 0, 2)).toBe(0);
    });
  });

  describe("classifyHarshDriving", () => {
    const config = { harshAccelMs2: 3.5, harshBrakeMs2: 3.5, harshCornerMs2: 3.0 };

    it("flags harsh braking", () => {
      // 72 -> 0 km/h in 3 s ≈ 6.67 m/s² deceleration.
      const result = classifyHarshDriving(
        { speedKph: 72, heading: 90 },
        { speedKph: 0, heading: 90 },
        3,
        config,
      );
      expect(result.isHarshBrake).toBe(true);
      expect(result.isHarshAccel).toBe(false);
      expect(result.brake).toBeGreaterThan(3.5);
    });

    it("flags harsh acceleration", () => {
      const result = classifyHarshDriving(
        { speedKph: 0, heading: 0 },
        { speedKph: 50, heading: 0 },
        2,
        config,
      );
      expect(result.isHarshAccel).toBe(true);
    });

    it("does not flag gentle driving", () => {
      const result = classifyHarshDriving(
        { speedKph: 50, heading: 90 },
        { speedKph: 52, heading: 92 },
        3,
        config,
      );
      expect(result.isHarshAccel).toBe(false);
      expect(result.isHarshBrake).toBe(false);
      expect(result.isHarshCorner).toBe(false);
    });

    it("skips cornering when heading is unknown", () => {
      const result = classifyHarshDriving(
        { speedKph: 60, heading: null },
        { speedKph: 60, heading: null },
        2,
        config,
      );
      expect(result.cornering).toBe(0);
      expect(result.isHarshCorner).toBe(false);
    });
  });
});
