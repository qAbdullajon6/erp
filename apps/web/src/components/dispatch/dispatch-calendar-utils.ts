import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';

export type CalendarView = 'month' | 'week' | 'day';

export interface CalendarEvent {
  id: string;
  dispatch: ApiDispatch;
  start: Date;
  end: Date;
  dayKey: string;
}

/// Status color lives on the left strip only — card surface stays neutral.
export const CALENDAR_STATUS_STRIP: Record<DispatchStatus, string> = {
  DRAFT: 'border-l-[6px] border-l-slate-400',
  ASSIGNED: 'border-l-[6px] border-l-blue-400',
  EN_ROUTE_TO_PICKUP: 'border-l-[6px] border-l-cyan-400',
  AT_PICKUP: 'border-l-[6px] border-l-amber-400',
  IN_TRANSIT: 'border-l-[6px] border-l-orange-400',
  DELIVERED: 'border-l-[6px] border-l-emerald-400',
  CANCELLED: 'border-l-[6px] border-l-red-400',
};

export const CALENDAR_STATUS_CLASS = CALENDAR_STATUS_STRIP;

export const CALENDAR_STATUS_DOT: Record<DispatchStatus, string> = {
  DRAFT: 'bg-slate-400',
  ASSIGNED: 'bg-blue-400',
  EN_ROUTE_TO_PICKUP: 'bg-cyan-400',
  AT_PICKUP: 'bg-amber-400',
  IN_TRANSIT: 'bg-orange-400',
  DELIVERED: 'bg-emerald-400',
  CANCELLED: 'bg-red-400',
};

export const CALENDAR_STATUS_GLOW: Record<DispatchStatus, string> = {
  DRAFT: 'hover:border-l-slate-300',
  ASSIGNED: 'hover:border-l-blue-300',
  EN_ROUTE_TO_PICKUP: 'hover:border-l-cyan-300',
  AT_PICKUP: 'hover:border-l-amber-300',
  IN_TRANSIT: 'hover:border-l-orange-300',
  DELIVERED: 'hover:border-l-emerald-300',
  CANCELLED: 'hover:border-l-red-300',
};

export const CALENDAR_STATUS_ACCENT_TEXT: Record<DispatchStatus, string> = {
  DRAFT: 'text-slate-300',
  ASSIGNED: 'text-blue-300',
  EN_ROUTE_TO_PICKUP: 'text-cyan-300',
  AT_PICKUP: 'text-amber-300',
  IN_TRANSIT: 'text-orange-300',
  DELIVERED: 'text-emerald-300',
  CANCELLED: 'text-red-300',
};

export function parseCalendarView(raw: unknown): CalendarView {
  if (raw === 'week' || raw === 'day' || raw === 'month') return raw;
  return 'week';
}

export function parseCalendarDate(raw: unknown, fallback = new Date()): Date {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return startOfDay(fallback);
  const parsed = parseISO(raw);
  return Number.isNaN(parsed.getTime()) ? startOfDay(fallback) : startOfDay(parsed);
}

export function toDateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function visibleRange(anchor: Date, view: CalendarView): { start: Date; end: Date } {
  if (view === 'day') {
    return { start: startOfDay(anchor), end: endOfDay(anchor) };
  }
  if (view === 'week') {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return { start, end: endOfWeek(anchor, { weekStartsOn: 1 }) };
  }
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  return {
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  };
}

export function shiftAnchor(anchor: Date, view: CalendarView, direction: -1 | 1): Date {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addWeeks(anchor, direction);
  return addMonths(anchor, direction);
}

export function rangeLabel(anchor: Date, view: CalendarView): string {
  if (view === 'day') return format(anchor, 'EEEE, MMM d, yyyy');
  if (view === 'week') {
    const { start, end } = visibleRange(anchor, 'week');
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return format(anchor, 'MMMM yyyy');
}

export function monthGridDays(anchor: Date): Date[] {
  const { start, end } = visibleRange(anchor, 'month');
  return eachDayOfInterval({ start, end });
}

export function weekDays(anchor: Date): Date[] {
  const { start, end } = visibleRange(anchor, 'week');
  return eachDayOfInterval({ start, end });
}

export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/// Planning calendar anchors on scheduled pickup (ops plan the day around pickup).
export function toCalendarEvent(dispatch: ApiDispatch): CalendarEvent {
  const start = parseISO(dispatch.pickupDateScheduled);
  const delivery = parseISO(dispatch.deliveryDateScheduled);
  const end =
    !Number.isNaN(delivery.getTime()) && delivery > start
      ? delivery
      : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    id: dispatch.id,
    dispatch,
    start: Number.isNaN(start.getTime()) ? new Date() : start,
    end: Number.isNaN(end.getTime()) ? start : end,
    dayKey: format(Number.isNaN(start.getTime()) ? new Date() : start, 'yyyy-MM-dd'),
  };
}

export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = map.get(event.dayKey) ?? [];
    list.push(event);
    map.set(event.dayKey, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  return map;
}

export function eventsForDay(byDay: Map<string, CalendarEvent[]>, date: Date): CalendarEvent[] {
  return byDay.get(dayKey(date)) ?? [];
}

export function driverShortName(dispatch: ApiDispatch): string {
  const d = dispatch.driver;
  if (!d) return 'Unassigned';
  const last = d.lastName?.charAt(0);
  return last ? `${d.firstName} ${last}.` : d.firstName;
}

export function formatEventTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function isOutsideMonth(day: Date, anchor: Date): boolean {
  return !isSameMonth(day, anchor);
}

export { isToday };
