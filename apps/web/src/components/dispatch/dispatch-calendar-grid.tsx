'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { format } from 'date-fns';
import { Truck, User } from 'lucide-react';
import { toast } from 'sonner';
import { dispatchesAPI } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { EmptyState } from '@/components/shared/list-states';
import { statusLabel } from '@/components/shared/status-badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { DispatchCalendarEventPreview } from '@/components/dispatch/dispatch-calendar-event-preview';
import { DispatchConflictBadge } from '@/components/dispatch/dispatch-conflict-badge';
import type { DispatchConflictsResponse } from '@/lib/api/dispatch-conflicts';
import { cn } from '@/lib/utils';
import {
  CALENDAR_STATUS_ACCENT_TEXT,
  CALENDAR_STATUS_CLASS,
  CALENDAR_STATUS_GLOW,
  dayKey,
  driverShortName,
  eventsForDay,
  isOutsideMonth,
  isToday,
  monthGridDays,
  weekDays,
  type CalendarEvent,
  type CalendarView,
} from './dispatch-calendar-utils';
import {
  TIMED_DAY_END_HOUR,
  TIMED_DAY_START_HOUR,
  TIMED_HOUR_HEIGHT_PX,
  canDragSchedule,
  computeRescheduleFromDrag,
  computeResizeDelivery,
  nowLineTopPx,
  timedEventLayout,
  timedGridHeightPx,
  timedHourLabels,
} from './dispatch-calendar-schedule';

const EVENT_CARD_BASE =
  'border-y border-r border-white/[0.08] bg-surface-elevated/90 text-foreground shadow-sm';

const MONTH_CELL_MAX = 3;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function conflictToastMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('driver') && (lower.includes('already') || lower.includes('assigned'))) {
    return 'Conflict detected — Driver already scheduled';
  }
  if (lower.includes('vehicle') && (lower.includes('already') || lower.includes('assigned'))) {
    return 'Conflict detected — Vehicle already scheduled';
  }
  return raw;
}

interface DispatchCalendarGridProps {
  view: CalendarView;
  anchor: Date;
  byDay: Map<string, CalendarEvent[]>;
  canWrite: boolean;
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
  onDayClick: (day: Date) => void;
  onRescheduled: () => Promise<void>;
  onQuickOpen?: (id: string) => void;
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>;
}

export function DispatchCalendarGrid({
  view,
  anchor,
  byDay,
  canWrite,
  selectedId,
  onSelect,
  onDayClick,
  onRescheduled,
  onQuickOpen,
  conflictsByDispatchId,
}: DispatchCalendarGridProps) {
  const [dragging, setDragging] = useState<CalendarEvent | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { calendarEvent?: CalendarEvent } | undefined;
    setDragging(data?.calendarEvent ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const calendarEvent = (event.active.data.current as { calendarEvent?: CalendarEvent } | undefined)
      ?.calendarEvent;
    setDragging(null);
    if (!calendarEvent || !canDragSchedule(calendarEvent.dispatch, canWrite)) return;

    const overId = event.over?.id;
    if (typeof overId !== 'string' || !overId.startsWith('calendar-day-')) return;
    const targetDayKey = overId.replace('calendar-day-', '');
    const targetDay = new Date(`${targetDayKey}T12:00:00`);
    if (Number.isNaN(targetDay.getTime())) return;

    const mode = view === 'month' ? 'day-only' : 'time';
    const { pickup, delivery } = computeRescheduleFromDrag({
      event: calendarEvent,
      targetDay,
      deltaYPx: event.delta.y,
      mode,
    });

    if (
      pickup.getTime() === calendarEvent.start.getTime() &&
      delivery.getTime() === calendarEvent.end.getTime()
    ) {
      return;
    }

    const previous = {
      pickupDateScheduled: calendarEvent.dispatch.pickupDateScheduled,
      deliveryDateScheduled: calendarEvent.dispatch.deliveryDateScheduled,
    };

    try {
      await dispatchesAPI.reschedule(calendarEvent.id, {
        pickupDateScheduled: pickup.toISOString(),
        deliveryDateScheduled: delivery.toISOString(),
      });
      await onRescheduled();
      toast.success(`${calendarEvent.dispatch.dispatchNumber} rescheduled`, {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () => {
            void (async () => {
              try {
                await dispatchesAPI.reschedule(calendarEvent.id, previous);
                await onRescheduled();
                toast.success(`${calendarEvent.dispatch.dispatchNumber} schedule restored`);
              } catch (undoErr) {
                toast.error(conflictToastMessage(describeError(undoErr, 'Undo failed')));
              }
            })();
          },
        },
      });
    } catch (err) {
      toast.error(conflictToastMessage(describeError(err, 'Reschedule rejected')));
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
      {view === 'month' && (
        <MonthGrid
          anchor={anchor}
          byDay={byDay}
          canWrite={canWrite}
          selectedId={selectedId}
          onSelect={onSelect}
          onDayClick={onDayClick}
          onRescheduled={onRescheduled}
          onQuickOpen={onQuickOpen}
          conflictsByDispatchId={conflictsByDispatchId}
        />
      )}
      {view === 'week' && (
        <TimedWeekGrid
          anchor={anchor}
          byDay={byDay}
          canWrite={canWrite}
          selectedId={selectedId}
          onSelect={onSelect}
          onRescheduled={onRescheduled}
          onQuickOpen={onQuickOpen}
          conflictsByDispatchId={conflictsByDispatchId}
        />
      )}
      {view === 'day' && (
        <TimedDayGrid
          anchor={anchor}
          byDay={byDay}
          canWrite={canWrite}
          selectedId={selectedId}
          onSelect={onSelect}
          onRescheduled={onRescheduled}
          onQuickOpen={onQuickOpen}
          conflictsByDispatchId={conflictsByDispatchId}
        />
      )}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div
            className={cn(
              'w-44 rounded-md px-2 py-1.5 text-xs shadow-xl ring-1 ring-white/10',
              EVENT_CARD_BASE,
              CALENDAR_STATUS_CLASS[dragging.dispatch.status],
            )}
          >
            <p className="truncate text-[11px] font-bold tracking-tight">
              {dragging.dispatch.dispatchNumber}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {timedEventLayout(dragging).rangeLabel}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function MonthGrid({
  anchor,
  byDay,
  canWrite,
  selectedId,
  onSelect,
  onDayClick,
  onRescheduled,
  onQuickOpen,
  conflictsByDispatchId,
}: {
  anchor: Date;
  byDay: Map<string, CalendarEvent[]>;
  canWrite: boolean;
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
  onDayClick: (day: Date) => void;
  onRescheduled: () => Promise<void>;
  onQuickOpen?: (id: string) => void;
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>;
}) {
  const days = monthGridDays(anchor);

  return (
    <div data-testid="calendar-month-grid">
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-white/[0.12] bg-surface/95 backdrop-blur-sm">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(6.5rem,1fr)]">
        {days.map((day) => {
          const key = dayKey(day);
          const dayEvents = eventsForDay(byDay, day);
          const outside = isOutsideMonth(day, anchor);
          const today = isToday(day);
          const overflow = Math.max(0, dayEvents.length - MONTH_CELL_MAX);

          return (
            <DayDroppable
              key={key}
              dayKey={key}
              className={cn(
                'flex min-h-[6.5rem] flex-col border-b border-r border-white/[0.08] p-1 transition-colors duration-150',
                outside && 'bg-muted/10',
                today && 'bg-brand/[0.04]',
              )}
            >
              <button
                type="button"
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center self-start rounded-md text-xs font-semibold transition-colors duration-150',
                  today && 'bg-gradient-brand text-brand-foreground shadow-sm',
                  !today && outside && 'text-muted-foreground/50',
                  !today && !outside && 'text-foreground hover:bg-white/5',
                )}
                onClick={() => onDayClick(day)}
                aria-label={`Open ${format(day, 'MMMM d')}`}
              >
                {format(day, 'd')}
              </button>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                {dayEvents.slice(0, MONTH_CELL_MAX).map((event) => (
                  <ScheduleEventChip
                    key={event.id}
                    event={event}
                    dense
                    canWrite={canWrite}
                    selected={selectedId === event.id}
                    onSelect={onSelect}
                    onRescheduled={onRescheduled}
                    onQuickOpen={onQuickOpen}
                    conflictData={conflictsByDispatchId?.[event.dispatch.id]}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    className="px-1 text-left text-[10px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    onClick={() => onDayClick(day)}
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </DayDroppable>
          );
        })}
      </div>
    </div>
  );
}

function TimedWeekGrid({
  anchor,
  byDay,
  canWrite,
  selectedId,
  onSelect,
  onRescheduled,
  onQuickOpen,
  conflictsByDispatchId,
}: {
  anchor: Date;
  byDay: Map<string, CalendarEvent[]>;
  canWrite: boolean;
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
  onRescheduled: () => Promise<void>;
  onQuickOpen?: (id: string) => void;
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>;
}) {
  const days = weekDays(anchor);
  const hours = timedHourLabels();
  const height = timedGridHeightPx();
  const nowTop = nowLineTopPx();

  return (
    <div className="relative h-full max-h-full overflow-auto" data-testid="calendar-week-grid">
      {/* Sticky weekday header */}
      <div className="sticky top-0 z-20 flex min-w-[48rem] border-b border-white/[0.12] bg-surface/95 backdrop-blur-md">
        <div className="sticky left-0 z-30 w-11 shrink-0 border-r border-white/[0.12] bg-surface/95" />
        <div className="grid flex-1 grid-cols-7">
          {days.map((day) => {
            const today = isToday(day);
            return (
              <div
                key={dayKey(day)}
                className={cn(
                  'flex h-12 flex-col items-center justify-center gap-0 border-r border-white/[0.12] px-1 last:border-r-0',
                  today && 'bg-brand/[0.16]',
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-[0.1em]',
                    today ? 'text-brand-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {format(day, 'EEE')}
                </span>
                <span
                  className={cn(
                    'mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-base font-bold tabular-nums leading-none',
                    today
                      ? 'bg-gradient-brand text-brand-foreground shadow-sm'
                      : 'text-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-[48rem]">
        {/* Sticky time column */}
        <div className="sticky left-0 z-10 w-11 shrink-0 border-r border-white/[0.12] bg-surface">
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 -translate-y-1/2 pr-1.5 text-right text-[11px] font-semibold tabular-nums text-foreground/70"
                style={{ top: (h - TIMED_DAY_START_HOUR) * TIMED_HOUR_HEIGHT_PX }}
              >
                {format(new Date(2000, 0, 1, h), 'HH')}
              </div>
            ))}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const dayEvents = eventsForDay(byDay, day);
            const today = isToday(day);
            return (
              <DayDroppable
                key={key}
                dayKey={key}
                dataTestId={`calendar-day-${key}`}
                className={cn(
                  'relative border-r border-white/[0.12] last:border-r-0 transition-colors duration-150',
                  today && 'bg-brand/[0.03]',
                )}
                style={{ height }}
              >
                <TimedGridLines hours={hours} />
                {today && <CurrentHourHighlight />}
                {today && nowTop != null && <NowIndicator top={nowTop} />}
                {dayEvents.map((event) => (
                  <ScheduleEventChip
                    key={event.id}
                    event={event}
                    timed
                    canWrite={canWrite}
                    selected={selectedId === event.id}
                    onSelect={onSelect}
                    onRescheduled={onRescheduled}
                    onQuickOpen={onQuickOpen}
                    conflictData={conflictsByDispatchId?.[event.dispatch.id]}
                  />
                ))}
              </DayDroppable>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimedDayGrid({
  anchor,
  byDay,
  canWrite,
  selectedId,
  onSelect,
  onRescheduled,
  onQuickOpen,
  conflictsByDispatchId,
}: {
  anchor: Date;
  byDay: Map<string, CalendarEvent[]>;
  canWrite: boolean;
  selectedId?: string;
  onSelect: (event: CalendarEvent) => void;
  onRescheduled: () => Promise<void>;
  onQuickOpen?: (id: string) => void;
  conflictsByDispatchId?: Record<string, DispatchConflictsResponse>;
}) {
  const dayEvents = eventsForDay(byDay, anchor);
  const hours = timedHourLabels();
  const height = timedGridHeightPx();
  const key = dayKey(anchor);
  const today = isToday(anchor);
  const nowTop = today ? nowLineTopPx() : null;

  return (
    <div className="flex min-h-[24rem] flex-col" data-testid="calendar-day-grid">
      <div
        className={cn(
          'sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.12] bg-surface/95 px-3 py-2.5 backdrop-blur-md',
          today && 'bg-brand/[0.16]',
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md text-base font-bold tabular-nums',
            today
              ? 'bg-gradient-brand text-brand-foreground shadow-sm'
              : 'bg-muted text-foreground',
          )}
        >
          {format(anchor, 'd')}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{format(anchor, 'EEEE')}</p>
          <p className="text-xs text-muted-foreground">{format(anchor, 'MMMM d, yyyy')}</p>
        </div>
      </div>

      <div className="flex overflow-auto">
        <div className="sticky left-0 z-10 w-11 shrink-0 border-r border-white/[0.12] bg-surface">
          <div className="relative" style={{ height }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 -translate-y-1/2 pr-1.5 text-right text-[11px] font-semibold tabular-nums text-foreground/70"
                style={{ top: (h - TIMED_DAY_START_HOUR) * TIMED_HOUR_HEIGHT_PX }}
              >
                {format(new Date(2000, 0, 1, h), 'HH')}
              </div>
            ))}
          </div>
        </div>
        <DayDroppable
          dayKey={key}
          className={cn('relative flex-1', today && 'bg-brand/[0.03]')}
          style={{ height }}
          dataTestId={`calendar-day-${key}`}
        >
          <TimedGridLines hours={hours} />
          {today && <CurrentHourHighlight />}
          {nowTop != null && <NowIndicator top={nowTop} />}
          {dayEvents.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <EmptyState
                title="No dispatches this day"
                description="Drag a dispatch here to reschedule."
                compact
              />
            </div>
          )}
          {dayEvents.map((event) => (
            <ScheduleEventChip
              key={event.id}
              event={event}
              timed
              canWrite={canWrite}
              selected={selectedId === event.id}
              onSelect={onSelect}
              onRescheduled={onRescheduled}
              onQuickOpen={onQuickOpen}
              conflictData={conflictsByDispatchId?.[event.dispatch.id]}
            />
          ))}
        </DayDroppable>
      </div>
    </div>
  );
}

function CurrentHourHighlight() {
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const tick = () => setHour(new Date().getHours());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (hour < TIMED_DAY_START_HOUR || hour >= TIMED_DAY_END_HOUR) return null;

  const top = (hour - TIMED_DAY_START_HOUR) * TIMED_HOUR_HEIGHT_PX;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-0 bg-brand/[0.07] shadow-[inset_0_0_20px_oklch(0.68_0.17_250/0.08)]"
      style={{ top, height: TIMED_HOUR_HEIGHT_PX }}
      data-testid="calendar-current-hour"
      aria-hidden="true"
    />
  );
}

function TimedGridLines({ hours }: { hours: number[] }) {
  return (
    <>
      {hours.map((h) => {
        const top = (h - TIMED_DAY_START_HOUR) * TIMED_HOUR_HEIGHT_PX;
        return (
          <div key={h}>
            <div
              className="absolute left-0 right-0 border-t border-white/[0.08]"
              style={{ top }}
            />
            {h < TIMED_DAY_END_HOUR && (
              <div
                className="absolute left-0 right-0 border-t border-white/[0.04]"
                style={{ top: top + TIMED_HOUR_HEIGHT_PX / 2 }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function NowIndicator({ top }: { top: number }) {
  const [liveTop, setLiveTop] = useState(top);
  useEffect(() => {
    const tick = () => setLiveTop(nowLineTopPx() ?? top);
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [top]);

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-[2]"
      style={{ top: liveTop }}
      data-testid="calendar-now-line"
      aria-hidden="true"
    >
      <div className="relative border-t border-red-500/80">
        <span className="absolute -left-[2px] -top-[2.5px] h-[5px] w-[5px] rounded-full bg-red-500" />
      </div>
    </div>
  );
}

function DayDroppable({
  dayKey: key,
  className,
  style,
  children,
  dataTestId,
}: {
  dayKey: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  dataTestId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day-${key}` });
  return (
    <div
      ref={setNodeRef}
      data-testid={dataTestId ?? `calendar-day-${key}`}
      className={cn(className, isOver && 'bg-brand/10')}
      style={style}
    >
      {children}
    </div>
  );
}

function ScheduleEventChip({
  event,
  dense,
  timed,
  canWrite,
  selected,
  onSelect,
  onRescheduled,
  onQuickOpen,
  conflictData,
}: {
  event: CalendarEvent;
  dense?: boolean;
  timed?: boolean;
  canWrite: boolean;
  selected?: boolean;
  onSelect: (event: CalendarEvent) => void;
  onRescheduled: () => Promise<void>;
  onQuickOpen?: (id: string) => void;
  conflictData?: DispatchConflictsResponse;
}) {
  const { dispatch } = event;
  const draggable = canDragSchedule(dispatch, canWrite);
  const layout = timedEventLayout(event);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `calendar-event-${event.id}`,
    data: { calendarEvent: event },
    disabled: !draggable,
  });

  const color = CALENDAR_STATUS_CLASS[dispatch.status];
  const glow = CALENDAR_STATUS_GLOW[dispatch.status];
  const driver = driverShortName(dispatch);
  const plate = dispatch.vehicle?.plateNumber;
  const customer = dispatch.order?.customer?.companyName;
  const style = timed
    ? {
        top: layout.top,
        height: layout.height,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }
    : {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      };

  const card = (
    <button
      type="button"
      data-testid={`calendar-event-${dispatch.dispatchNumber}`}
      onClick={() => onSelect(event)}
      className={cn(
        'group relative flex h-full w-full flex-col justify-start overflow-hidden text-left',
        'transition-[box-shadow,transform,opacity,border-color] duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'hover:z-[3] hover:scale-[1.01] hover:shadow-lg',
        EVENT_CARD_BASE,
        color,
        glow,
        selected && 'ring-2 ring-brand/70 shadow-md',
        dense ? 'gap-0 rounded-sm px-1.5 py-1' : 'gap-1 rounded-sm px-2 py-1.5',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging && 'opacity-35',
      )}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      aria-pressed={selected}
    >
      {dense ? (
        <>
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[10px] font-bold tracking-tight">
              {dispatch.dispatchNumber}
            </span>
            <DispatchConflictBadge
              summary={conflictData?.summary}
              conflicts={conflictData?.items}
              className="ml-auto"
            />
            <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
              {format(event.start, 'HH:mm')}
            </span>
          </div>
          <p className="truncate text-[9px] leading-tight text-muted-foreground">{driver}</p>
        </>
      ) : (
        <>
          <p
            className={cn(
              'truncate text-[9px] font-bold uppercase tracking-[0.06em] leading-tight',
              CALENDAR_STATUS_ACCENT_TEXT[dispatch.status],
            )}
          >
            {statusLabel(dispatch.status)}
          </p>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-bold leading-tight tracking-tight text-foreground">
              {dispatch.dispatchNumber}
            </span>
            <DispatchConflictBadge
              summary={conflictData?.summary}
              conflicts={conflictData?.items}
            />
          </div>
          {customer && layout.height >= 56 && (
            <p className="truncate text-[11px] leading-snug text-foreground/85">{customer}</p>
          )}
          {layout.height >= 68 && (
            <p className="flex min-w-0 items-center gap-1 truncate text-[10px] leading-snug text-muted-foreground">
              <User className="h-3 w-3 shrink-0 opacity-80" aria-hidden="true" />
              <span className="truncate">{driver}</span>
            </p>
          )}
          {layout.height >= 80 && plate && (
            <p className="flex min-w-0 items-center gap-1 truncate text-[10px] leading-snug text-muted-foreground">
              <Truck className="h-3 w-3 shrink-0 opacity-80" aria-hidden="true" />
              <span className="truncate font-medium">{plate}</span>
            </p>
          )}
          <p className="mt-auto truncate text-[10px] font-semibold tabular-nums leading-tight text-foreground/70">
            {layout.rangeLabel}
            {layout.truncated ? ' …' : ''}
          </p>
        </>
      )}
      {timed && draggable && <ResizeHandle event={event} onRescheduled={onRescheduled} />}
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        timed && 'absolute left-0.5 right-0.5 z-[1] hover:z-[40]',
        'transition-opacity duration-150',
      )}
    >
      <HoverCard openDelay={120} closeDelay={100}>
        <HoverCardTrigger asChild>{card}</HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          collisionPadding={12}
          className="z-[100] border-0 bg-transparent p-0 shadow-none duration-150"
        >
          <DispatchCalendarEventPreview
            event={event}
            onQuickOpen={
              onQuickOpen
                ? () => onQuickOpen(dispatch.id)
                : undefined
            }
          />
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

function ResizeHandle({
  event,
  onRescheduled,
}: {
  event: CalendarEvent;
  onRescheduled: () => Promise<void>;
}) {
  const startY = useRef(0);
  const [resizing, setResizing] = useState(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    startY.current = e.clientY;
    setResizing(true);

    const onMove = (_ev: PointerEvent) => {
      void _ev;
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizing(false);
      const deltaY = ev.clientY - startY.current;
      if (Math.abs(deltaY) < 4) return;
      const nextDelivery = computeResizeDelivery(event, deltaY);
      if (nextDelivery.getTime() === event.end.getTime()) return;

      const previous = {
        pickupDateScheduled: event.dispatch.pickupDateScheduled,
        deliveryDateScheduled: event.dispatch.deliveryDateScheduled,
      };

      void (async () => {
        try {
          await dispatchesAPI.reschedule(event.id, {
            pickupDateScheduled: event.dispatch.pickupDateScheduled,
            deliveryDateScheduled: nextDelivery.toISOString(),
          });
          await onRescheduled();
          toast.success(`${event.dispatch.dispatchNumber} duration updated`, {
            duration: 8000,
            action: {
              label: 'Undo',
              onClick: () => {
                void (async () => {
                  try {
                    await dispatchesAPI.reschedule(event.id, previous);
                    await onRescheduled();
                    toast.success('Duration restored');
                  } catch (undoErr) {
                    toast.error(conflictToastMessage(describeError(undoErr, 'Undo failed')));
                  }
                })();
              },
            },
          });
        } catch (err) {
          toast.error(conflictToastMessage(describeError(err, 'Resize rejected')));
        }
      })();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <span
      role="separator"
      aria-label="Resize duration"
      data-testid={`calendar-resize-${event.dispatch.dispatchNumber}`}
      onPointerDown={onPointerDown}
      className={cn(
        'absolute inset-x-0 bottom-0 h-2 cursor-ns-resize rounded-b transition-colors duration-150',
        resizing ? 'bg-brand/40' : 'hover:bg-foreground/10',
      )}
    />
  );
}
