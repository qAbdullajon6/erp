'use client';

import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LeadTimelineEvent } from '@/lib/api/leads';

const TYPE_HINT: Record<string, string> = {
  DEMO_REQUESTED: 'Intake',
  SALES_CONTACTED: 'Sales',
  QUALIFIED: 'Sales',
  CONVERTED: 'Convert',
  INVITATION_SENT: 'Invite',
  INVITATION_ACCEPTED: 'Activate',
  ORGANIZATION_ACTIVATED: 'Activate',
};

export function LeadTimeline({
  events,
  className,
}: {
  events: LeadTimelineEvent[];
  className?: string;
}) {
  if (events.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No timeline events yet. Status changes and conversion will appear here.
      </p>
    );
  }

  return (
    <ol className={cn('relative space-y-0', className)}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-[7px] top-4 h-[calc(100%-0.5rem)] w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span
              className="relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand ring-4 ring-background"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {TYPE_HINT[event.type] ?? event.type}
                </span>
              </div>
              {event.body ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{event.body}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
