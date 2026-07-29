'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import {
  activeConflicts,
  highestActiveSeverity,
  type ConflictSeverity,
  type DispatchConflictSummary,
  type DispatchConflict,
  type DispatchConflictsResponse,
} from '@/lib/api/dispatch-conflicts';

const SEVERITY_BADGE: Record<ConflictSeverity, string> = {
  critical: 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-400',
  high: 'border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-400',
  medium: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400',
  low: 'border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function DispatchConflictBadge({
  summary,
  conflicts,
  className,
}: {
  summary?: Pick<DispatchConflictSummary, 'unresolved' | 'critical' | 'high' | 'medium' | 'low'>;
  conflicts?: DispatchConflict[];
  className?: string;
}) {
  const count = summary?.unresolved ?? 0;
  if (count <= 0) return null;

  const response: DispatchConflictsResponse | null = conflicts
    ? {
        dispatchId: '',
        items: conflicts,
        summary: summary as DispatchConflictSummary,
        checkedAt: '',
      }
    : summary
      ? {
          dispatchId: '',
          items: [],
          summary: summary as DispatchConflictSummary,
          checkedAt: '',
        }
      : null;

  const severity = highestActiveSeverity(response) ?? 'high';
  const active = conflicts ? activeConflicts(response) : [];
  const critical =
    summary?.critical ?? active.filter((c) => c.severity === 'critical').length ?? 0;

  return (
    <HoverCard openDelay={200} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Badge
          variant="outline"
          data-testid="dispatch-conflict-badge"
          className={cn('h-5 gap-1 px-1.5 text-[10px]', SEVERITY_BADGE[severity], className)}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {count}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="top">
        <p className="text-xs font-semibold text-foreground">
          {count} conflict{count === 1 ? '' : 's'}
          {critical > 0 ? ` · ${critical} critical` : ''}
        </p>
        {conflicts && conflicts.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {conflicts.slice(0, 4).map((c) => (
              <li key={c.id}>• {c.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Open dispatch for details.</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
