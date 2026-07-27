'use client';

import { memo } from 'react';
import { EmptyState } from '@/components/shared/list-states';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TrackingHistoryPoint } from '@/lib/api/tracking';
import {
  buildHistoryTimeline,
  formatDurationSec,
  type HistoryTimelineEvent,
} from '@/components/fleet-tracking/fleet-ops';
import { Activity } from 'lucide-react';

interface Props {
  points: TrackingHistoryPoint[];
  loading?: boolean;
}

export const FleetHistoryTimeline = memo(function FleetHistoryTimeline({
  points,
  loading,
}: Props) {
  const events = buildHistoryTimeline(points);

  return (
    <section aria-label="Asset history timeline">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        History timeline
      </h3>
      {loading ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-surface p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          compact
          icon={Activity}
          title="No history segments"
          description="Movement, stop, and offline periods appear when GPS history points are returned."
        />
      ) : (
        <ol className="space-y-1.5 rounded-lg border border-border/60 bg-surface p-2">
          {events
            .slice()
            .reverse()
            .slice(0, 40)
            .map((event) => (
              <TimelineRow key={event.id} event={event} />
            ))}
          <li className="px-2 py-1.5 text-[10px] text-muted-foreground">
            Fuel and ignition changes are not available on history points from
            the API.
          </li>
        </ol>
      )}
    </section>
  );
});

function TimelineRow({ event }: { event: HistoryTimelineEvent }) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border border-border/40 px-2.5 py-2 text-xs',
      )}
    >
      <span
        className={cn(
          'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full',
          event.kind === 'moving' && 'bg-success',
          event.kind === 'idle' && 'bg-warning',
          event.kind === 'stopped' && 'bg-brand',
          event.kind === 'offline' && 'bg-destructive',
          event.kind === 'unknown' && 'bg-muted-foreground',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">{event.label}</span>
          <span className="tabular-nums text-[10px] text-muted-foreground">
            {formatDurationSec(event.durationSec)}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {formatRelativeTime(event.at)}
          {event.pointCount > 1 ? ` · ${event.pointCount} points` : ''}
        </p>
      </div>
    </li>
  );
}
