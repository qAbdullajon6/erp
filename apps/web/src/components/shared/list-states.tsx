'use client';

import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Inbox, type LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

/// The three states every list screen goes through before it can show rows.
/// Previously each module hand-rolled these with hardcoded greys and reds,
/// which broke in dark mode; these use the shared tokens instead.

/// Prefer TableSkeleton over LoadingState for anything that resolves into rows:
/// a centred spinner tells the user "wait" and nothing else, then the table
/// snaps in at a different height and shifts the page under their cursor.
export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite" aria-busy="true">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" aria-hidden />
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/// The loading state for anything that resolves into a list of rows.
///
/// A spinner is the wrong shape for a table: it occupies a single centred line,
/// so the moment the rows arrive the container jumps from ~120px to full height
/// and everything below it moves. Painting the row structure up front keeps the
/// page still and tells the user what is coming, which reads as a faster load
/// even when it is not.
///
/// `columns` are relative widths (flex-grow ratios), so [3, 2, 2, 1] renders a
/// wide first column and a narrow last one without any of the callers needing to
/// know pixel values. Pass `hideBelow` for columns a table drops on small
/// screens, so the skeleton and the real row hide the same cells.
export function TableSkeleton({
  columns = [3, 2, 2, 2],
  rows = 6,
  showHeader = true,
  hideBelow,
  label = 'Loading',
}: {
  columns?: number[];
  rows?: number;
  showHeader?: boolean;
  /// Index from which columns are hidden on narrow viewports, matching the
  /// table's own responsive column hiding.
  hideBelow?: { from: number; at: 'sm' | 'md' | 'lg' };
  label?: string;
}) {
  const hiddenClass = (index: number) => {
    if (!hideBelow || index < hideBelow.from) return undefined;
    return {
      sm: 'hidden sm:flex',
      md: 'hidden md:flex',
      lg: 'hidden lg:flex',
    }[hideBelow.at];
  };

  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label={`${label}…`}>
      <span className="sr-only">{label}…</span>
      {showHeader ? (
        <div className="flex items-center gap-4 border-b border-border/60 bg-muted/30 px-4 py-3" aria-hidden>
          {columns.map((width, i) => (
            <div key={i} className={cn('flex', hiddenClass(i))} style={{ flexGrow: width, flexBasis: 0 }}>
              <Skeleton className="h-3 w-full max-w-[7rem]" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="divide-y divide-border/50" aria-hidden>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
            {columns.map((width, i) => (
              <div key={i} className={cn('flex', hiddenClass(i))} style={{ flexGrow: width, flexBasis: 0 }}>
                {/* Staggered widths stop the block reading as a solid grey grid;
                    real rows never all end at the same x-position either. */}
                <Skeleton className={cn('h-4', i === 0 ? 'w-4/5' : rowIndex % 3 === 0 ? 'w-1/2' : 'w-2/3')} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/// Row-shaped loading for lists that are not tables — stacked cards, timelines,
/// notification feeds. Each row gets a leading glyph block and two text lines.
export function ListSkeleton({
  rows = 5,
  showAvatar = true,
  label = 'Loading',
}: {
  rows?: number;
  showAvatar?: boolean;
  label?: string;
}) {
  return (
    <div className="divide-y divide-border/50" role="status" aria-busy="true" aria-live="polite" aria-label={`${label}…`}>
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5" aria-hidden>
          {showAvatar ? <Skeleton className="h-9 w-9 shrink-0 rounded-lg" /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-5 w-20 shrink-0 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-6" role="alert">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{message}</span>
        {onRetry ? (
          <Button onClick={onRetry} variant="outline" size="sm">
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /// Defaults to the generic Inbox glyph every list screen already used —
  /// pass a fitting icon (TrendingUp, PackageCheck, ...) for a context that
  /// warrants one, rather than reaching for a new empty-state component.
  icon?: ComponentType<LucideProps>;
  /// Dense empty state for dashboard / panel cards where py-16 wastes a full
  /// viewport of vertical space without adding clarity.
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-col items-center justify-center px-4 py-8 text-center"
          : "flex flex-col items-center justify-center py-16 text-center"
      }
    >
      <div className={compact ? "rounded-full bg-muted p-2.5" : "rounded-full bg-muted p-4"}>
        <Icon className={compact ? "h-5 w-5 text-muted-foreground" : "h-7 w-7 text-muted-foreground"} />
      </div>
      <p className={compact ? "mt-2.5 text-sm font-medium text-foreground" : "mt-4 font-medium text-foreground"}>
        {title}
      </p>
      {description ? (
        <p
          className={
            compact
              ? "mx-auto mt-1 max-w-xs text-xs text-muted-foreground"
              : "mx-auto mt-1 max-w-xs text-sm text-muted-foreground"
          }
        >
          {description}
        </p>
      ) : null}
      {action ? <div className={compact ? "mt-3" : "mt-4"}>{action}</div> : null}
    </div>
  );
}
