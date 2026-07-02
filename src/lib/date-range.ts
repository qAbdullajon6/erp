export type DateRangeOption =
  | "today"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export const dateRangeMeta: Record<DateRangeOption, { label: string }> = {
  today: { label: "Today" },
  this_week: { label: "This Week" },
  this_month: { label: "This Month" },
  this_quarter: { label: "This Quarter" },
  this_year: { label: "This Year" },
  custom: { label: "Custom Range" },
};

export const dateRangeOrder: DateRangeOption[] = [
  "today",
  "this_week",
  "this_month",
  "this_quarter",
  "this_year",
  "custom",
];

export interface DateBounds {
  start: Date;
  end: Date;
}

export function resolveDateRange(
  option: DateRangeOption,
  now: Date,
  custom?: { start: string; end: string },
): DateBounds {
  if (option === "custom" && custom?.start && custom?.end) {
    const end = new Date(custom.end);
    end.setHours(23, 59, 59, 999);
    return { start: new Date(custom.start), end };
  }

  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (option) {
    case "this_week": {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday-start week
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "this_month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "this_quarter": {
      const quarter = Math.floor(start.getMonth() / 3);
      start.setMonth(quarter * 3, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "this_year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "today":
    default:
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end };
}

export function isWithinRange(iso: string, bounds: DateBounds): boolean {
  const t = new Date(iso).getTime();
  return t >= bounds.start.getTime() && t <= bounds.end.getTime();
}

export interface TimeBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

/** Daily buckets for ranges up to ~45 days, monthly buckets otherwise. */
export function buildTimeBuckets(bounds: DateBounds): TimeBucket[] {
  const spanMs = bounds.end.getTime() - bounds.start.getTime();
  const spanDays = spanMs / (24 * 60 * 60 * 1000);
  const buckets: TimeBucket[] = [];

  if (spanDays <= 45) {
    const cursor = new Date(bounds.start);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= bounds.end.getTime()) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setHours(23, 59, 59, 999);
      buckets.push({
        key: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start,
        end,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
    while (cursor.getTime() <= bounds.end.getTime()) {
      const start = new Date(cursor);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({
        key: `${start.getFullYear()}-${start.getMonth()}`,
        label: start.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        start,
        end,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return buckets;
}
