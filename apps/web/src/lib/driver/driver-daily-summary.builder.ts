import { sumBreakMinutes, type BreakInterval } from './break-minutes';

export interface DriverDailyTripInput {
  id: string;
  status: string;
  pickupDateScheduled: string;
  deliveryDateScheduled: string;
  deliveryDateActual: string | null;
  pickupDateActual: string | null;
}

export interface DriverDailyExpenseInput {
  amount: string | number;
  category?: string;
  expenseDate?: string;
  createdAt?: string;
}

export interface BuildDriverDailySummaryInput {
  trips: DriverDailyTripInput[];
  expenses?: DriverDailyExpenseInput[];
  breaks?: BreakInterval[];
  /** Placeholder until telematics distance lands. */
  distanceKm?: number | null;
  now?: Date;
}

export interface DriverDailySummary {
  trips: number;
  completed: number;
  distanceKm: number | null;
  hours: number;
  fuelTotal: number;
  expensesTotal: number;
  breakMinutes: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

function toAmount(v: string | number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function buildDriverDailySummary(input: BuildDriverDailySummaryInput): DriverDailySummary {
  const now = input.now ?? new Date();
  const today = startOfDay(now);

  const tripsToday = (input.trips ?? []).filter(
    (t) =>
      isSameDay(t.pickupDateScheduled, today) ||
      isSameDay(t.deliveryDateScheduled, today) ||
      (t.deliveryDateActual != null && isSameDay(t.deliveryDateActual, today)),
  );
  const completed = tripsToday.filter((t) => t.status === 'DELIVERED');

  let hoursMs = 0;
  for (const t of tripsToday) {
    const startIso = t.pickupDateActual ?? t.pickupDateScheduled;
    const endIso = t.deliveryDateActual ?? (t.status === 'DELIVERED' ? now.toISOString() : null);
    if (!endIso) continue;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      hoursMs += end - start;
    }
  }

  const expensesToday = (input.expenses ?? []).filter((e) => {
    const iso = e.expenseDate ?? e.createdAt;
    return iso ? isSameDay(iso, today) : true;
  });

  let fuelTotal = 0;
  let expensesTotal = 0;
  for (const e of expensesToday) {
    const amt = toAmount(e.amount);
    expensesTotal += amt;
    if ((e.category ?? '').toUpperCase() === 'FUEL') fuelTotal += amt;
  }

  const breaksToday = (input.breaks ?? []).filter((b) => isSameDay(b.startedAt, today));

  return {
    trips: tripsToday.length,
    completed: completed.length,
    distanceKm: input.distanceKm ?? null,
    hours: Math.round((hoursMs / 3_600_000) * 10) / 10,
    fuelTotal: Math.round(fuelTotal * 100) / 100,
    expensesTotal: Math.round(expensesTotal * 100) / 100,
    breakMinutes: sumBreakMinutes(breaksToday, now, true),
  };
}
