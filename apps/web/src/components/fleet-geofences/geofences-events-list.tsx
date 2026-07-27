'use client';

import { memo, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { GeofenceEventItem, GeofenceEventType } from '@/lib/api/telematics';
import { geofenceEventLabel } from '@/components/fleet-geofences/geofences-ops';
import { ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';

const ROW_HEIGHT = 56;
const VIEWPORT_HEIGHT = 360;
const OVERSCAN = 6;

interface Props {
  events: GeofenceEventItem[];
  selectedEventId: string | null;
  onSelect: (event: GeofenceEventItem) => void;
  errorMessage?: string | null;
  loading?: boolean;
  fenceNameById?: Map<string, string>;
}

export const GeofencesEventsList = memo(function GeofencesEventsList({
  events,
  selectedEventId,
  onSelect,
  errorMessage,
  loading,
  fenceNameById,
}: Props) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN,
  );
  const visibleCount =
    Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(events.length, startIndex + visibleCount);
  const visible = events.slice(startIndex, endIndex);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border/60 bg-surface">
      <div className="border-b border-border/60 px-3 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Events · {events.length}
        </h2>
      </div>
      {errorMessage ? (
        <p className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
      {loading ? (
        <p className="px-3 py-5 text-xs text-muted-foreground">
          Loading events…
        </p>
      ) : events.length === 0 ? (
        <p className="px-3 py-5 text-xs text-muted-foreground">
          No geofence events returned for this filter.
        </p>
      ) : (
        <div
          className="overflow-y-auto"
          style={{ height: VIEWPORT_HEIGHT }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          aria-label="Geofence events timeline"
        >
          <div
            className="relative"
            style={{ height: events.length * ROW_HEIGHT }}
          >
            {visible.map((event, visibleIndex) => {
              const index = startIndex + visibleIndex;
              const selected = event.id === selectedEventId;
              const fenceName =
                fenceNameById?.get(event.geofenceId) ??
                `${event.geofenceId.slice(0, 8)}…`;
              return (
                <button
                  key={event.id}
                  type="button"
                  className={cn(
                    'absolute inset-x-0 flex h-[56px] items-center gap-2.5 border-b border-border/40 px-3 text-left',
                    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                    selected ? 'bg-brand/10' : 'hover:bg-muted/25',
                  )}
                  style={{ top: index * ROW_HEIGHT }}
                  onClick={() => onSelect(event)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <EventIcon type={event.type} active={selected} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {geofenceEventLabel(event.type)}
                      {event.dwellSec != null
                        ? ` · ${event.dwellSec}s`
                        : ''}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {fenceName} · {formatDateTime(event.occurredAt)}
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

function EventIcon({
  type,
  active,
}: {
  type: GeofenceEventType;
  active: boolean;
}) {
  const Icon =
    type === 'ENTER'
      ? ArrowDownLeft
      : type === 'EXIT'
        ? ArrowUpRight
        : Clock;
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        active ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}
