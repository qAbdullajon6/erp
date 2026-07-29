import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { DispatchStatus } from '@/lib/api/dispatches';
import type { CalendarView } from './dispatch-calendar-utils';
import { toDateParam } from './dispatch-calendar-utils';

export type CalendarDatePreset = 'today' | 'tomorrow' | 'week' | 'month' | 'custom';

export type CalendarStatusFilter =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export type CalendarFilterState = {
  driverId?: string;
  vehicleId?: string;
  customerId?: string;
  status?: CalendarStatusFilter;
  q?: string;
  preset?: CalendarDatePreset;
  from?: string;
  to?: string;
  kpiFocus?: CalendarKpiFocus;
};

export type CalendarKpiFocus = 'active' | 'delayed' | 'completed' | 'conflicts';

export const CALENDAR_STATUS_OPTIONS: Array<{
  value: CalendarStatusFilter;
  label: string;
}> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'EN_ROUTE_TO_PICKUP', label: 'To Pickup' },
  { value: 'AT_PICKUP', label: 'At Pickup' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'DELIVERED', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function parseCalendarPreset(raw: unknown): CalendarDatePreset | undefined {
  if (
    raw === 'today' ||
    raw === 'tomorrow' ||
    raw === 'week' ||
    raw === 'month' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return undefined;
}

export function parseOptionalId(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw) ? raw : undefined;
}

export function parseCalendarStatus(raw: unknown): CalendarStatusFilter | undefined {
  if (typeof raw !== 'string') return undefined;
  const upper = raw.toUpperCase().replace(/-/g, '_');
  return CALENDAR_STATUS_OPTIONS.some((o) => o.value === upper)
    ? (upper as CalendarStatusFilter)
    : undefined;
}

export function parseOptionalDateParam(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

export function parseOptionalQuery(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

export function parseCalendarKpiFocus(raw: unknown): CalendarKpiFocus | undefined {
  if (raw === 'active' || raw === 'delayed' || raw === 'completed' || raw === 'conflicts') {
    return raw;
  }
  return undefined;
}

export function countActiveFilters(filters: CalendarFilterState): number {
  let n = 0;
  if (filters.driverId) n++;
  if (filters.vehicleId) n++;
  if (filters.customerId) n++;
  if (filters.status) n++;
  if (filters.q) n++;
  if (filters.kpiFocus) n++;
  if (filters.preset && filters.preset !== 'custom') n++;
  if (filters.preset === 'custom' && (filters.from || filters.to)) n++;
  return n;
}

export function statusToApiParam(status?: CalendarStatusFilter): DispatchStatus | undefined {
  return status;
}

/// Date presets jump the calendar anchor/view (read-first planning shortcuts).
export function applyDatePreset(
  preset: CalendarDatePreset,
  now = new Date(),
): { view: CalendarView; date: Date; from?: string; to?: string } {
  const today = startOfDay(now);
  if (preset === 'today') {
    return { view: 'day', date: today };
  }
  if (preset === 'tomorrow') {
    return { view: 'day', date: addDays(today, 1) };
  }
  if (preset === 'week') {
    return { view: 'week', date: today };
  }
  if (preset === 'month') {
    return { view: 'month', date: today };
  }
  return {
    view: 'week',
    date: today,
    from: toDateParam(today),
    to: toDateParam(addDays(today, 6)),
  };
}

export function customRangeBounds(from?: string, to?: string): { start: Date; end: Date } | null {
  if (!from && !to) return null;
  const start = startOfDay(new Date(`${from ?? to}T00:00:00`));
  const end = endOfDay(new Date(`${to ?? from}T00:00:00`));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

export function presetLabel(preset: CalendarDatePreset): string {
  switch (preset) {
    case 'today':
      return 'Today';
    case 'tomorrow':
      return 'Tomorrow';
    case 'week':
      return 'This week';
    case 'month':
      return 'This month';
    case 'custom':
      return 'Custom dates';
  }
}

export function weekBounds(anchor: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(anchor, { weekStartsOn: 1 }),
    end: endOfWeek(anchor, { weekStartsOn: 1 }),
  };
}

export function monthBounds(anchor: Date): { start: Date; end: Date } {
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}
