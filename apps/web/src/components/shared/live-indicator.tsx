'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/// "Is what I'm looking at current?" — answered the same way everywhere.
///
/// The dispatch board and the dispatch calendar each carried a byte-identical
/// copy of this pill, which is two places to fix when the polling interval
/// changes and two chances for them to disagree about what "live" means while
/// sitting one click apart in the same module.
///
/// The wording is deliberately literal. It reports the age of the data we have,
/// not a promise about the connection: a stuck poller shows a climbing number
/// rather than a reassuring green dot.
export function LiveIndicator({
  refreshing,
  ageSeconds,
  className,
  title = 'Refreshes every 30s while this tab is open',
}: {
  refreshing: boolean;
  ageSeconds: number;
  className?: string;
  title?: string;
}) {
  const label = refreshing
    ? 'Updating'
    : ageSeconds < 5
      ? 'Live'
      : `Live · ${ageSeconds}s`;

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium',
        refreshing
          ? 'border-border text-muted-foreground'
          : 'border-success/40 bg-success/10 text-success',
        className,
      )}
      title={title}
    >
      {refreshing ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      )}
      {label}
    </span>
  );
}
