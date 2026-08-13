import { isScheduleLate, startOfTodayUtc, wasDeliveredOnTime } from "./schedule-lateness.util";

/// The bug this pins: `deliveryDate` is a date-only value stored at midnight, and
/// six call sites compared it to `Date.now()`. An order due today was therefore
/// reported as delayed all day, and a same-day order was delayed the second it
/// was created — the first thing an operator saw on a brand new job was a red
/// "Delayed" badge.

describe("schedule lateness", () => {
  const now = new Date("2026-08-13T14:30:00.000Z");
  const today = new Date("2026-08-13T00:00:00.000Z");
  const yesterday = new Date("2026-08-12T00:00:00.000Z");
  const tomorrow = new Date("2026-08-14T00:00:00.000Z");

  it("does not call a delivery due today late", () => {
    expect(isScheduleLate(today, now)).toBe(false);
  });

  it("is still not late one minute before the day ends", () => {
    expect(isScheduleLate(today, new Date("2026-08-13T23:59:00.000Z"))).toBe(false);
  });

  it("is late once the day it was due has passed", () => {
    expect(isScheduleLate(yesterday, now)).toBe(true);
    expect(isScheduleLate(today, new Date("2026-08-14T00:00:00.000Z"))).toBe(true);
  });

  it("is not late for a future day", () => {
    expect(isScheduleLate(tomorrow, now)).toBe(false);
  });

  it("resolves today to midnight UTC regardless of the time of day", () => {
    expect(startOfTodayUtc(now).toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(startOfTodayUtc(new Date("2026-08-13T00:00:01.000Z")).toISOString()).toBe(
      "2026-08-13T00:00:00.000Z",
    );
  });

  describe("on-time delivery", () => {
    it("counts a delivery made during the due day as on time", () => {
      expect(wasDeliveredOnTime(new Date("2026-08-13T10:00:00.000Z"), today)).toBe(true);
      expect(wasDeliveredOnTime(new Date("2026-08-13T23:59:59.000Z"), today)).toBe(true);
    });

    it("counts a delivery made the next day as late", () => {
      expect(wasDeliveredOnTime(new Date("2026-08-14T00:00:01.000Z"), today)).toBe(false);
    });

    it("counts an early delivery as on time", () => {
      expect(wasDeliveredOnTime(new Date("2026-08-12T09:00:00.000Z"), today)).toBe(true);
    });
  });
});
