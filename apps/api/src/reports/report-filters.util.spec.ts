import {
  buildExceptionOrderWhere,
  buildOrderWhere,
  enumerateBuckets,
  parseReportDateBound,
  resolveBucketGranularity,
  resolveReportFilter,
  resolveZonedDayRange,
} from "./report-filters.util";

describe("buildOrderWhere / buildExceptionOrderWhere", () => {
  it("excludes archived orders, matching OrdersService.list's own default", () => {
    const filter = resolveReportFilter(
      { dateFrom: "2026-07-01", dateTo: "2026-07-31", comparisonPeriod: "none" },
      "UTC",
    );
    const where = buildOrderWhere("org-1", filter, filter.range);
    expect(where.archivedAt).toBeNull();
  });

  it("excludes archived orders from the live-exception queries too", () => {
    const filter = resolveReportFilter({ comparisonPeriod: "none" }, "UTC");
    const where = buildExceptionOrderWhere("org-1", filter);
    expect(where.archivedAt).toBeNull();
  });
});

describe("parseReportDateBound", () => {
  it("expands date-only strings to inclusive UTC day bounds", () => {
    const start = parseReportDateBound("2026-07-26", "start");
    const end = parseReportDateBound("2026-07-26", "end");
    expect(start.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-26T23:59:59.999Z");
  });

  it("leaves full ISO timestamps untouched", () => {
    const value = "2026-07-26T15:30:00.000Z";
    expect(parseReportDateBound(value, "start").toISOString()).toBe(value);
    expect(parseReportDateBound(value, "end").toISOString()).toBe(value);
  });
});

describe("resolveReportFilter", () => {
  it("does not double-count the shared boundary for previous_period", () => {
    const resolved = resolveReportFilter(
      {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        comparisonPeriod: "previous_period",
      },
      "UTC",
    );
    expect(resolved.comparisonRange).not.toBeNull();
    expect(resolved.comparisonRange!.to.getTime()).toBe(resolved.range.from.getTime() - 1);
  });

  it("defaults currency unset until ReportsService fills org default", () => {
    const resolved = resolveReportFilter({ comparisonPeriod: "none" }, "Asia/Tashkent");
    expect(resolved.currency).toBeUndefined();
    expect(resolved.timezone).toBe("Asia/Tashkent");
  });

  it("defaults to exactly 30 daily buckets when neither date bound is given (Command Center's call pattern)", () => {
    // Regression: anchoring `to` at a raw `now` timestamp instead of a
    // calendar-day boundary made a 30-day default span 31 distinct
    // calendar-day buckets once re-bucketed by day, contradicting the
    // "Last 30 days" label the Command Center's Trends chart shows.
    const resolved = resolveReportFilter({ comparisonPeriod: "none" }, "UTC");
    const granularity = resolveBucketGranularity(resolved.range);
    const buckets = enumerateBuckets(resolved.range, granularity, resolved.timezone);
    expect(buckets.length).toBe(30);
  });
});

describe("resolveZonedDayRange", () => {
  it("brackets the local calendar day for a +05:00 zone (no DST)", () => {
    // 11:15 UTC on 2026-07-26 is 16:15 the same day in Tashkent (+05:00),
    // so "today" runs from 19:00Z the previous day to 18:59:59.999Z today.
    const now = new Date("2026-07-26T11:15:00.000Z");
    const { from, to } = resolveZonedDayRange(now, "Asia/Tashkent");
    expect(from.toISOString()).toBe("2026-07-25T19:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-26T18:59:59.999Z");
  });

  it("matches the UTC calendar day for UTC", () => {
    const now = new Date("2026-07-26T11:15:00.000Z");
    const { from, to } = resolveZonedDayRange(now, "UTC");
    expect(from.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-26T23:59:59.999Z");
  });

  it("handles a negative-offset zone spanning the UTC date boundary", () => {
    // 02:00 UTC on 2026-07-26 is still 22:00 on 2026-07-25 in New York (−04:00 DST).
    const now = new Date("2026-07-26T02:00:00.000Z");
    const { from, to } = resolveZonedDayRange(now, "America/New_York");
    expect(from.toISOString()).toBe("2026-07-25T04:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-26T03:59:59.999Z");
  });

  it("falls back to a UTC day for an invalid timezone", () => {
    const now = new Date("2026-07-26T11:15:00.000Z");
    const { from, to } = resolveZonedDayRange(now, "Not/AZone");
    expect(from.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-26T23:59:59.999Z");
  });
});

describe("enumerateBuckets", () => {
  it("does not append a day past dateTo for a timezone ahead of UTC", () => {
    // range.to is 2026-07-31T23:59:59.999Z — already 2026-08-01 04:59:59.999
    // in Asia/Tashkent (+05:00). A time-series chart for "last month" must
    // not grow an extra August point just because the org is east of UTC.
    const range = {
      from: parseReportDateBound("2026-07-01", "start"),
      to: parseReportDateBound("2026-07-31", "end"),
    };
    const keys = enumerateBuckets(range, "day", "Asia/Tashkent");
    expect(keys[0]).toBe("2026-07-01");
    expect(keys[keys.length - 1]).toBe("2026-07-31");
    expect(keys).toHaveLength(31);
    expect(keys).not.toContain("2026-08-01");
  });

  it("still covers the full range for UTC", () => {
    const range = {
      from: parseReportDateBound("2026-07-01", "start"),
      to: parseReportDateBound("2026-07-31", "end"),
    };
    const keys = enumerateBuckets(range, "day", "UTC");
    expect(keys).toHaveLength(31);
    expect(keys[0]).toBe("2026-07-01");
    expect(keys[keys.length - 1]).toBe("2026-07-31");
  });
});
