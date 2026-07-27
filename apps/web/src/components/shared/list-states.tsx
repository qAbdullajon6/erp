'use client';

import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Inbox, type LucideProps } from 'lucide-react';

/// The three states every list screen goes through before it can show rows.
/// Previously each module hand-rolled these with hardcoded greys and reds,
/// which broke in dark mode; these use the shared tokens instead.

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
