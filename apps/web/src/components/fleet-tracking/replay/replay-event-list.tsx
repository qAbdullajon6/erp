'use client';

import { memo, useMemo, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReplayEvent } from './replay-ops';
import { CircleStop, Flag, Gauge, MapPin, Radio } from 'lucide-react';

const ROW_HEIGHT = 52;
const VIEWPORT_HEIGHT = 304;
const OVERSCAN = 5;

interface Props {
  events: ReplayEvent[];
  playheadMs: number;
  onSeek: (timestampMs: number) => void;
  errorMessage?: string | null;
}

export const ReplayEventList = memo(function ReplayEventList({
  events,
  playheadMs,
  onSeek,
  errorMessage,
}: Props) {
  const [scrollTop, setScrollTop] = useState(0);

  const activeIndex = useMemo(() => {
    let active = -1;
    for (let index = 0; index < events.length; index += 1) {
      if (Date.parse(events[index].at) > playheadMs) break;
      active = index;
    }
    return active;
  }, [events, playheadMs]);

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN,
  );
  const visibleCount =
    Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(events.length, startIndex + visibleCount);
  const visible = events.slice(startIndex, endIndex);

  return (
    <section className="rounded-lg border border-border/60 bg-surface">
      <div className="border-b border-border/60 px-3 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recorded events · {events.length}
        </h2>
      </div>
      {errorMessage ? (
        <p className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
      {events.length === 0 ? (
        <p className="px-3 py-5 text-xs text-muted-foreground">
          No timeline events were returned for this trip.
        </p>
      ) : (
        <div
          className="overflow-y-auto"
          style={{ height: VIEWPORT_HEIGHT }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          aria-label="Recorded trip events"
        >
          <div
            className="relative"
            style={{ height: events.length * ROW_HEIGHT }}
          >
            {visible.map((event, visibleIndex) => {
              const index = startIndex + visibleIndex;
              const active = index === activeIndex;
              const Icon =
                event.kind === 'trip-started'
                  ? Flag
                  : event.kind === 'trip-completed'
                    ? CircleStop
                    : event.kind === 'geofence'
                      ? MapPin
                    : event.movementState === 'MOVING'
                      ? Gauge
                      : Radio;

              return (
                <button
                  key={event.id}
                  type="button"
                  className={cn(
                    'absolute inset-x-0 flex h-[52px] items-center gap-2.5 border-b border-border/40 px-3 text-left',
                    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                    active ? 'bg-brand/10' : 'hover:bg-muted/25',
                  )}
                  style={{ top: index * ROW_HEIGHT }}
                  onClick={() => onSeek(Date.parse(event.at))}
                  aria-current={active ? 'time' : undefined}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      active
                        ? 'bg-brand/20 text-brand'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {event.label}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {formatDateTime(event.at)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
});
