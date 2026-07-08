import { Prisma } from "@prisma/client";
import { ReportFilterDto } from "./dto/report-filter.dto";

const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateRange {
  from: Date;
  to: Date;
}

/// Fully resolved filter state for one report request — every field the
/// DTO left optional has a concrete default here, so every computation
/// downstream can assume `dateFrom`/`dateTo`/`timezone` are always present.
export interface ResolvedReportFilter {
  range: DateRange;
  comparisonRange: DateRange | null;
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  pickupCity?: string;
  deliveryCity?: string;
  orderStatus?: string;
  invoiceStatus?: string;
  currency?: string;
  timezone: string;
}

function shiftYears(date: Date, years: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return shifted;
}

/// No date filter at all resolves to "the last 30 days" — a bounded,
/// sensible default rather than an unbounded all-time scan, and one that
/// makes `comparisonPeriod` meaningful without forcing the caller to
/// always specify explicit dates.
export function resolveReportFilter(dto: ReportFilterDto, organizationTimezone: string): ResolvedReportFilter {
  const now = new Date();
  const to = dto.dateTo ? new Date(dto.dateTo) : now;
  const from = dto.dateFrom ? new Date(dto.dateFrom) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  let comparisonRange: DateRange | null = null;
  if (dto.comparisonPeriod === "previous_period") {
    const rangeMs = to.getTime() - from.getTime();
    comparisonRange = { from: new Date(from.getTime() - rangeMs), to: new Date(from.getTime()) };
  } else if (dto.comparisonPeriod === "previous_year") {
    comparisonRange = { from: shiftYears(from, -1), to: shiftYears(to, -1) };
  }

  return {
    range: { from, to },
    comparisonRange,
    customerId: dto.customerId,
    driverId: dto.driverId,
    vehicleId: dto.vehicleId,
    pickupCity: dto.pickupCity,
    deliveryCity: dto.deliveryCity,
    orderStatus: dto.orderStatus,
    invoiceStatus: dto.invoiceStatus,
    currency: dto.currency,
    timezone: dto.timezone || organizationTimezone || "UTC",
  };
}

/// Orders are anchored to `deliveryDate` for date-range filtering — the
/// natural "when did this order happen" date for a logistics report.
export function buildOrderWhere(
  organizationId: string,
  filter: ResolvedReportFilter,
  range: DateRange,
): Prisma.OrderWhereInput {
  return {
    organizationId,
    deliveryDate: { gte: range.from, lte: range.to },
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.driverId ? { driverId: filter.driverId } : {}),
    ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
    ...(filter.pickupCity ? { pickupCity: { equals: filter.pickupCity, mode: "insensitive" } } : {}),
    ...(filter.deliveryCity ? { deliveryCity: { equals: filter.deliveryCity, mode: "insensitive" } } : {}),
    ...(filter.orderStatus ? { status: filter.orderStatus as never } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
  };
}

/// Invoices are anchored to `issueDate`.
export function buildInvoiceWhere(
  organizationId: string,
  filter: ResolvedReportFilter,
  range: DateRange,
): Prisma.InvoiceWhereInput {
  return {
    organizationId,
    issueDate: { gte: range.from, lte: range.to },
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.invoiceStatus ? { status: filter.invoiceStatus as never } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
  };
}

/// For the two "current state" exceptions (delayed, unassigned) that
/// describe a live operational problem rather than a historical event —
/// deliberately has NO date-range clause, so these reflect right now
/// regardless of the report's selected window, while still respecting
/// every other filter (customer/driver/vehicle/city/currency).
export function buildExceptionOrderWhere(
  organizationId: string,
  filter: ResolvedReportFilter,
): Prisma.OrderWhereInput {
  return {
    organizationId,
    ...(filter.customerId ? { customerId: filter.customerId } : {}),
    ...(filter.driverId ? { driverId: filter.driverId } : {}),
    ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
    ...(filter.pickupCity ? { pickupCity: { equals: filter.pickupCity, mode: "insensitive" } } : {}),
    ...(filter.deliveryCity ? { deliveryCity: { equals: filter.deliveryCity, mode: "insensitive" } } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
  };
}

/// Expenses are anchored to `expenseDate`. customerId/pickupCity/
/// deliveryCity/orderStatus/invoiceStatus don't apply to Expense directly —
/// only driverId/vehicleId/currency carry over, matching Expense's own
/// filterable fields.
export function buildExpenseWhere(
  organizationId: string,
  filter: ResolvedReportFilter,
  range: DateRange,
): Prisma.ExpenseWhereInput {
  return {
    organizationId,
    expenseDate: { gte: range.from, lte: range.to },
    ...(filter.driverId ? { driverId: filter.driverId } : {}),
    ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
    ...(filter.currency ? { currency: filter.currency } : {}),
  };
}

export type BucketGranularity = "day" | "month";

/// Daily buckets for a range of 45 days or less, monthly otherwise — same
/// threshold the frontend demo's date-range.ts already established, kept
/// consistent here on the backend.
export function resolveBucketGranularity(range: DateRange): BucketGranularity {
  const days = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  return days <= 45 ? "day" : "month";
}

/// The calendar bucket key a UTC instant falls into, expressed in the
/// given IANA timezone — "YYYY-MM-DD" for day buckets, "YYYY-MM" for month
/// buckets. Uses Intl.DateTimeFormat (built into Node) rather than a new
/// date-timezone dependency.
export function bucketKeyFor(date: Date, granularity: BucketGranularity, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const formatted = formatter.format(date); // "YYYY-MM-DD" under en-CA
    return granularity === "day" ? formatted : formatted.slice(0, 7);
  } catch {
    // An invalid IANA timezone string falls back to UTC rather than
    // throwing — a bad `timezone` filter shouldn't 500 the whole report.
    const iso = date.toISOString();
    return granularity === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
  }
}

/// Every bucket key in [from, to], inclusive, in chronological order — so a
/// time series always has a point for days/months with zero activity
/// instead of silently skipping them.
export function enumerateBuckets(range: DateRange, granularity: BucketGranularity, timezone: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const stepMs = granularity === "day" ? DAY_MS : DAY_MS; // step by day either way; month keys naturally collapse duplicates
  for (let t = range.from.getTime(); t <= range.to.getTime(); t += stepMs) {
    const key = bucketKeyFor(new Date(t), granularity, timezone);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  const lastKey = bucketKeyFor(range.to, granularity, timezone);
  if (!seen.has(lastKey)) keys.push(lastKey);
  return keys;
}

/// `((current - previous) / previous) * 100`, or `null` when `previous` is
/// zero — "where mathematically valid" per the phase spec, since division
/// by zero has no meaningful percentage-change interpretation.
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
