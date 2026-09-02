export interface DriverPerformanceTripInput {
  id: string;
  status: string;
  pickupDateScheduled: string;
  deliveryDateScheduled: string;
  pickupDateActual: string | null;
  deliveryDateActual: string | null;
  statusHistory?: Array<{ status: string; createdAt: string }>;
}

export interface BuildDriverPerformanceInput {
  trips: DriverPerformanceTripInput[];
  now?: Date;
}

export interface DriverPerformanceSnapshot {
  trips: number;
  completed: number;
  cancelled: number;
  onTimePct: number;
  latePct: number;
  avgLoadingMinutes: number | null;
  avgDeliveryMinutes: number | null;
}

function minutesBetween(aIso: string, bIso: string): number | null {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60_000);
}

function historyStamp(trip: DriverPerformanceTripInput, status: string): string | null {
  const entry = trip.statusHistory?.find((h) => h.status === status);
  return entry?.createdAt ?? null;
}

export function buildDriverPerformance(input: BuildDriverPerformanceInput): DriverPerformanceSnapshot {
  const trips = input.trips ?? [];
  const completed = trips.filter((t) => t.status === 'DELIVERED');
  const cancelled = trips.filter((t) => t.status === 'CANCELLED');

  let onTime = 0;
  let late = 0;
  for (const t of completed) {
    if (!t.deliveryDateActual) continue;
    if (new Date(t.deliveryDateActual).getTime() <= new Date(t.deliveryDateScheduled).getTime()) {
      onTime += 1;
    } else {
      late += 1;
    }
  }
  const scored = onTime + late;
  const onTimePct = scored === 0 ? 0 : Math.round((onTime / scored) * 100);
  const latePct = scored === 0 ? 0 : Math.round((late / scored) * 100);

  const loadingSamples: number[] = [];
  const deliverySamples: number[] = [];

  for (const t of completed) {
    const atPickup =
      t.pickupDateActual ?? historyStamp(t, 'AT_PICKUP') ?? historyStamp(t, 'EN_ROUTE_TO_PICKUP');
    const inTransit = historyStamp(t, 'IN_TRANSIT') ?? t.deliveryDateActual;
    if (atPickup && inTransit) {
      const m = minutesBetween(atPickup, inTransit);
      if (m != null && m >= 0 && m <= 24 * 60) loadingSamples.push(m);
    }

    const start =
      historyStamp(t, 'IN_TRANSIT') ?? t.pickupDateActual ?? historyStamp(t, 'AT_PICKUP');
    const end = t.deliveryDateActual;
    if (start && end) {
      const m = minutesBetween(start, end);
      if (m != null && m >= 0 && m <= 7 * 24 * 60) deliverySamples.push(m);
    }
  }

  const avg = (samples: number[]) =>
    samples.length === 0
      ? null
      : Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

  return {
    trips: trips.length,
    completed: completed.length,
    cancelled: cancelled.length,
    onTimePct,
    latePct,
    avgLoadingMinutes: avg(loadingSamples),
    avgDeliveryMinutes: avg(deliverySamples),
  };
}
