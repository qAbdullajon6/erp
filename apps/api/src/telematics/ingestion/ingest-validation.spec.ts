import {
  filterIngestBatch,
  isAcceptableRecordedAt,
  isNullIsland,
  isUsableGpsCoordinate,
  MAX_FUTURE_SKEW_MS,
} from "./ingest-validation";
import type { NormalizedPosition } from "../providers/telematics-provider.interface";

function fix(
  overrides: Partial<NormalizedPosition> & Pick<NormalizedPosition, "recordedAt" | "latitude" | "longitude">,
): NormalizedPosition {
  return {
    speedKph: null,
    heading: null,
    altitudeM: null,
    accuracyM: null,
    ignitionOn: null,
    odometerKm: null,
    fuelLevelPct: null,
    satellites: null,
    ...overrides,
  };
}

describe("ingest-validation", () => {
  it("rejects null island and invalid coordinates", () => {
    expect(isNullIsland(0, 0)).toBe(true);
    expect(isUsableGpsCoordinate(0, 0)).toBe(false);
    expect(isUsableGpsCoordinate(41.3, 69.2)).toBe(true);
    expect(isUsableGpsCoordinate(91, 0)).toBe(false);
  });

  it("rejects timestamps beyond future skew", () => {
    const now = Date.parse("2026-07-26T12:00:00.000Z");
    expect(isAcceptableRecordedAt(new Date(now + MAX_FUTURE_SKEW_MS), now)).toBe(true);
    expect(isAcceptableRecordedAt(new Date(now + MAX_FUTURE_SKEW_MS + 1), now)).toBe(false);
  });

  it("filters duplicates, OOO, future, and null island from a batch", () => {
    const now = Date.parse("2026-07-26T12:00:00.000Z");
    const last = new Date("2026-07-26T11:59:50.000Z");
    const result = filterIngestBatch(
      [
        fix({ recordedAt: new Date("2026-07-26T11:59:40.000Z"), latitude: 41.3, longitude: 69.2 }),
        fix({ recordedAt: new Date("2026-07-26T11:59:50.000Z"), latitude: 41.3, longitude: 69.2 }),
        fix({ recordedAt: new Date("2026-07-26T12:00:01.000Z"), latitude: 0, longitude: 0 }),
        fix({ recordedAt: new Date(now + MAX_FUTURE_SKEW_MS + 5_000), latitude: 41.3, longitude: 69.2 }),
        fix({ recordedAt: new Date("2026-07-26T12:00:01.000Z"), latitude: 41.31, longitude: 69.21 }),
        fix({ recordedAt: new Date("2026-07-26T12:00:01.000Z"), latitude: 41.32, longitude: 69.22 }),
        fix({
          recordedAt: new Date("2026-07-26T12:00:02.000Z"),
          latitude: 41.33,
          longitude: 69.23,
          raw: { idempotencyKey: "k1" },
        }),
        fix({
          recordedAt: new Date("2026-07-26T12:00:03.000Z"),
          latitude: 41.34,
          longitude: 69.24,
          raw: { idempotencyKey: "k1" },
        }),
      ],
      { lastRecordedAt: last, nowMs: now },
    );

    expect(result.accepted).toHaveLength(2);
    expect(result.accepted.map((p) => p.recordedAt.toISOString())).toEqual([
      "2026-07-26T12:00:01.000Z",
      "2026-07-26T12:00:02.000Z",
    ]);
    expect(result.rejected).toBe(6);
    expect(result.decisions).toHaveLength(8);
    expect(result.decisions.filter((d) => d.accepted)).toHaveLength(2);
    expect(result.reasons.out_of_order).toBe(1);
    expect(result.reasons.duplicate_timestamp).toBeGreaterThanOrEqual(1);
    expect(result.reasons.null_island).toBe(1);
    expect(result.reasons.future_timestamp).toBe(1);
    expect(result.reasons.duplicate_idempotency_key).toBe(1);
  });
});
