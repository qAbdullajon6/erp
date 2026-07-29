import {
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  setHours,
  setMinutes,
  setSeconds,
  startOfDay,
} from 'date-fns';
import type { ApiDispatch, DispatchStatus } from '@/lib/api/dispatches';
import type { CalendarEvent } from './dispatch-calendar-utils';

export const SCHEDULE_SNAP_MINUTES = 30;
export const TIMED_DAY_START_HOUR = 6;
export const TIMED_DAY_END_HOUR = 22;
export const TIMED_HOUR_HEIGHT_PX = 60;
/// Long multi-day trips still start at pickup, but the block stays scannable
/// (≈2h) like enterprise scheduler chips.
export const MAX_EVENT_DISPLAY_MINUTES = 120;

const TERMINAL: DispatchStatus[] = ['DELIVERED', 'CANCELLED'];

export function canDragSchedule(dispatch: ApiDispatch, canWrite: boolean): boolean {
  return canWrite && !TERMINAL.includes(dispatch.status);
}

export function snapMinutes(totalMinutes: number, step = SCHEDULE_SNAP_MINUTES): number {
  return Math.round(totalMinutes / step) * step;
}

export function clampTimedMinutes(totalMinutes: number): number {
  const min = TIMED_DAY_START_HOUR * 60;
  const max = TIMED_DAY_END_HOUR * 60;
  return Math.min(max, Math.max(min, totalMinutes));
}

export function minutesFromDayStart(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function applyDayKeepingClock(source: Date, targetDay: Date): Date {
  return setSeconds(
    setMinutes(setHours(startOfDay(targetDay), source.getHours()), source.getMinutes()),
    0,
  );
}

export function applyDeltaMinutes(source: Date, deltaMinutes: number): Date {
  return addMinutes(source, deltaMinutes);
}

export function durationMinutes(event: CalendarEvent): number {
  return Math.max(SCHEDULE_SNAP_MINUTES, differenceInMinutes(event.end, event.start));
}

export function formatEventRange(event: CalendarEvent): string {
  const start = format(event.start, 'HH:mm');
  if (!isSameDay(event.start, event.end)) {
    return `${start} → ${format(event.end, 'MMM d HH:mm')}`;
  }
  return `${start} → ${format(event.end, 'HH:mm')}`;
}

export interface TimedEventLayout {
  top: number;
  height: number;
  truncated: boolean;
  rangeLabel: string;
}

/// Positions the block at pickup; height follows real duration, clipped to the
/// visible day and capped so overnight windows don't paint the whole column.
export function timedEventLayout(event: CalendarEvent): TimedEventLayout {
  const gridStart = TIMED_DAY_START_HOUR * 60;
  const gridEnd = TIMED_DAY_END_HOUR * 60;
  const startMins = clampTimedMinutes(minutesFromDayStart(event.start));
  const naturalEnd = startMins + durationMinutes(event);
  const endWithinGrid = Math.min(gridEnd, naturalEnd);
  const visibleMins = Math.max(SCHEDULE_SNAP_MINUTES, endWithinGrid - startMins);
  const displayMins = Math.min(visibleMins, MAX_EVENT_DISPLAY_MINUTES);
  const truncated = visibleMins > MAX_EVENT_DISPLAY_MINUTES || naturalEnd > gridEnd;

  return {
    top: ((startMins - gridStart) / 60) * TIMED_HOUR_HEIGHT_PX,
    height: Math.max(72, (displayMins / 60) * TIMED_HOUR_HEIGHT_PX),
    truncated,
    rangeLabel: formatEventRange(event),
  };
}

export function eventTopPx(event: CalendarEvent): number {
  return timedEventLayout(event).top;
}

export function eventHeightPx(event: CalendarEvent): number {
  return timedEventLayout(event).height;
}

export function timedGridHeightPx(): number {
  return (TIMED_DAY_END_HOUR - TIMED_DAY_START_HOUR) * TIMED_HOUR_HEIGHT_PX;
}

export function timedHourLabels(): number[] {
  const hours: number[] = [];
  for (let h = TIMED_DAY_START_HOUR; h < TIMED_DAY_END_HOUR; h++) hours.push(h);
  return hours;
}

export function nowLineTopPx(now = new Date()): number | null {
  const mins = minutesFromDayStart(now);
  const min = TIMED_DAY_START_HOUR * 60;
  const max = TIMED_DAY_END_HOUR * 60;
  if (mins < min || mins > max) return null;
  return ((mins - min) / 60) * TIMED_HOUR_HEIGHT_PX;
}

export function computeRescheduleFromDrag(input: {
  event: CalendarEvent;
  targetDay: Date;
  deltaYPx: number;
  mode: 'time' | 'day-only';
}): { pickup: Date; delivery: Date } {
  const duration = durationMinutes(input.event);
  let nextPickup: Date;

  if (input.mode === 'day-only') {
    nextPickup = applyDayKeepingClock(input.event.start, input.targetDay);
  } else {
    const deltaMinutes = snapMinutes((input.deltaYPx / TIMED_HOUR_HEIGHT_PX) * 60);
    const onTargetDay = applyDayKeepingClock(input.event.start, input.targetDay);
    const moved = applyDeltaMinutes(onTargetDay, deltaMinutes);
    const snapped = clampTimedMinutes(snapMinutes(minutesFromDayStart(moved)));
    nextPickup = setSeconds(
      setMinutes(setHours(startOfDay(input.targetDay), Math.floor(snapped / 60)), snapped % 60),
      0,
    );
  }

  return {
    pickup: nextPickup,
    delivery: addMinutes(nextPickup, duration),
  };
}

export function computeResizeDelivery(event: CalendarEvent, deltaYPx: number): Date {
  const deltaMinutes = snapMinutes((deltaYPx / TIMED_HOUR_HEIGHT_PX) * 60);
  const next = applyDeltaMinutes(event.end, deltaMinutes);
  const minEnd = addMinutes(event.start, SCHEDULE_SNAP_MINUTES);
  return next <= minEnd ? minEnd : next;
}
