import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { getDeliveryUrgency, isDispatchOverdue } from './dispatch-ops';

/// A dispatch is scheduled to a *day*: `deliveryDateScheduled` carries the
/// order's date-only delivery date, so midnight. The board compared it to
/// `Date.now()`, which made every job due today read "14h late" in red by the
/// afternoon — and a same-day job red from the minute it was created.

function dispatchDue(iso: string): ApiDispatch {
  return { status: 'ASSIGNED', deliveryDateScheduled: iso } as ApiDispatch;
}

afterEach(() => {
  vi.useRealTimers();
});

function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('a delivery due today', () => {
  it('is not overdue in the middle of that day', () => {
    at('2026-08-13T14:30:00.000Z');
    expect(isDispatchOverdue(dispatchDue('2026-08-13T00:00:00.000Z'))).toBe(false);
  });

  it('reads as due today rather than late', () => {
    at('2026-08-13T14:30:00.000Z');
    const urgency = getDeliveryUrgency('2026-08-13T00:00:00.000Z');
    expect(urgency.isLate).toBe(false);
    expect(urgency.dueToday).toBe(true);
    expect(urgency.label).toBe('Due today');
  });

  it('is still not late at one minute to midnight', () => {
    at('2026-08-13T23:59:00.000Z');
    expect(isDispatchOverdue(dispatchDue('2026-08-13T00:00:00.000Z'))).toBe(false);
  });
});

describe('a delivery whose day has passed', () => {
  it('is overdue', () => {
    at('2026-08-14T09:00:00.000Z');
    expect(isDispatchOverdue(dispatchDue('2026-08-13T00:00:00.000Z'))).toBe(true);
  });

  it('is reported late, counting from the end of the day it was due', () => {
    at('2026-08-14T09:00:00.000Z');
    const urgency = getDeliveryUrgency('2026-08-13T00:00:00.000Z');
    expect(urgency.isLate).toBe(true);
    expect(urgency.label).toBe('9h late');
  });

  it('rolls over to days once a full day has passed', () => {
    at('2026-08-16T09:00:00.000Z');
    expect(getDeliveryUrgency('2026-08-13T00:00:00.000Z').label).toBe('3d late');
  });
});

describe('a delivery due later', () => {
  it('reads as tomorrow the day before', () => {
    at('2026-08-13T14:30:00.000Z');
    expect(getDeliveryUrgency('2026-08-14T00:00:00.000Z').label).toBe('Tomorrow');
  });

  it('counts remaining days from the scheduled day', () => {
    at('2026-08-13T14:30:00.000Z');
    expect(getDeliveryUrgency('2026-08-16T00:00:00.000Z').label).toBe('3d left');
  });
});
