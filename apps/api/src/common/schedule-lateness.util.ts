/// When a scheduled delivery counts as late.
///
/// `Order.pickupDate` and `Order.deliveryDate` are date-only values: the API
/// accepts "2026-08-13" and Postgres stores midnight. Six call sites — the
/// order response, the delayed-order notification, the customer portal, and
/// three report queries — each asked `deliveryDate < now`, which is true from
/// 00:00 on the delivery day itself. Every order due today was reported as
/// delayed for the whole day it was due, and a same-day order was born late.
///
/// A day-granular commitment is missed when the day is over, so the cutoff is
/// the start of today: anything scheduled for an earlier day is late, anything
/// scheduled for today still has the day to run.

export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isScheduleLate(scheduledFor: Date, now: Date = new Date()): boolean {
  return scheduledFor.getTime() < startOfTodayUtc(now).getTime();
}

/// The moment a day-granular commitment expires: midnight at the end of it.
export function endOfScheduledDay(scheduledFor: Date): Date {
  return new Date(scheduledFor.getTime() + 24 * 60 * 60 * 1000);
}

/// On-time delivery rate had the same off-by-a-day: `deliveredAt <= deliveryDate`
/// compares a real timestamp against midnight, so a shipment delivered at 10am
/// on the day it was due counted against the operator.
export function wasDeliveredOnTime(deliveredAt: Date, deliveryDate: Date): boolean {
  return deliveredAt.getTime() < endOfScheduledDay(deliveryDate).getTime();
}
