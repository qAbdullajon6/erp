import { classifyMovement, type MovementConfig, type MovementPriorState } from "./movement-detector";

const config: MovementConfig = { idleThresholdSec: 300, stopThresholdSec: 180 };

const t = (iso: string) => new Date(iso);

describe("movement-detector", () => {
  it("classifies a fast fix as MOVING and clears the stationary spell", () => {
    const prior: MovementPriorState = {
      movementState: "STOPPED",
      lastMovingAt: t("2026-07-17T09:00:00Z"),
      stationarySince: t("2026-07-17T09:00:00Z"),
      lastRecordedAt: t("2026-07-17T09:05:00Z"),
    };
    const result = classifyMovement(
      { speedKph: 40, ignitionOn: true, recordedAt: t("2026-07-17T09:05:10Z") },
      prior,
      config,
    );
    expect(result.movementState).toBe("MOVING");
    expect(result.becameMoving).toBe(true);
    expect(result.stationarySince).toBeNull();
    expect(result.lastMovingAt).toEqual(t("2026-07-17T09:05:10Z"));
  });

  it("opens a stationary spell when a moving vehicle stops", () => {
    const prior: MovementPriorState = {
      movementState: "MOVING",
      lastMovingAt: t("2026-07-17T09:00:00Z"),
      stationarySince: null,
      lastRecordedAt: t("2026-07-17T09:00:00Z"),
    };
    const result = classifyMovement(
      { speedKph: 0, ignitionOn: true, recordedAt: t("2026-07-17T09:00:05Z") },
      prior,
      config,
    );
    expect(result.movementState).toBe("IDLING");
    expect(result.becameStationary).toBe(true);
    expect(result.stationarySince).toEqual(t("2026-07-17T09:00:05Z"));
    expect(result.stationarySec).toBe(0);
  });

  it("fires crossedIdleThreshold exactly once when idling past the threshold", () => {
    const stationarySince = t("2026-07-17T09:00:00Z");
    // Just before the 300s threshold: not yet crossed.
    const before = classifyMovement(
      { speedKph: 0, ignitionOn: true, recordedAt: t("2026-07-17T09:04:00Z") },
      { movementState: "IDLING", lastMovingAt: null, stationarySince, lastRecordedAt: t("2026-07-17T09:03:55Z") },
      config,
    );
    expect(before.crossedIdleThreshold).toBe(false);

    // Crossing the threshold from a prior fix that was below it: fires once.
    const crossing = classifyMovement(
      { speedKph: 0, ignitionOn: true, recordedAt: t("2026-07-17T09:05:10Z") },
      { movementState: "IDLING", lastMovingAt: null, stationarySince, lastRecordedAt: t("2026-07-17T09:04:00Z") },
      config,
    );
    expect(crossing.crossedIdleThreshold).toBe(true);

    // A later fix still idling, prior already past threshold: does not re-fire.
    const after = classifyMovement(
      { speedKph: 0, ignitionOn: true, recordedAt: t("2026-07-17T09:06:00Z") },
      { movementState: "IDLING", lastMovingAt: null, stationarySince, lastRecordedAt: t("2026-07-17T09:05:10Z") },
      config,
    );
    expect(after.crossedIdleThreshold).toBe(false);
  });

  it("treats ignition-off stationary as STOPPED, not IDLING", () => {
    const result = classifyMovement(
      { speedKph: 0, ignitionOn: false, recordedAt: t("2026-07-17T09:10:00Z") },
      { movementState: "MOVING", lastMovingAt: t("2026-07-17T09:09:00Z"), stationarySince: null, lastRecordedAt: t("2026-07-17T09:09:00Z") },
      config,
    );
    expect(result.movementState).toBe("STOPPED");
    expect(result.crossedIdleThreshold).toBe(false);
  });

  it("fires crossedStopThreshold once after the stop threshold", () => {
    const stationarySince = t("2026-07-17T09:00:00Z");
    const crossing = classifyMovement(
      { speedKph: 0, ignitionOn: false, recordedAt: t("2026-07-17T09:03:10Z") },
      { movementState: "STOPPED", lastMovingAt: null, stationarySince, lastRecordedAt: t("2026-07-17T09:02:00Z") },
      config,
    );
    expect(crossing.crossedStopThreshold).toBe(true);

    const after = classifyMovement(
      { speedKph: 0, ignitionOn: false, recordedAt: t("2026-07-17T09:04:00Z") },
      { movementState: "STOPPED", lastMovingAt: null, stationarySince, lastRecordedAt: t("2026-07-17T09:03:10Z") },
      config,
    );
    expect(after.crossedStopThreshold).toBe(false);
  });
});
