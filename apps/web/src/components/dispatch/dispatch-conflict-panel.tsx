'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ShieldAlert,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  activeConflicts,
  useDispatchConflicts,
  useCheckDispatchConflicts,
  useIgnoreDispatchConflict,
  useResolveDispatchConflict,
  type ConflictSeverity,
  type DispatchConflict,
} from '@/lib/api/dispatch-conflicts';
import { DISPATCH_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

const SEVERITY_STYLES: Record<
  ConflictSeverity,
  { badge: string; ring: string; label: string }
> = {
  critical: {
    badge: 'bg-red-500/15 text-red-700 dark:text-red-400',
    ring: 'ring-red-500/30',
    label: 'Critical',
  },
  high: {
    badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
    ring: 'ring-orange-500/30',
    label: 'High',
  },
  medium: {
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    ring: 'ring-amber-500/30',
    label: 'Medium',
  },
  low: {
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-500/30',
    label: 'Low',
  },
};

function categoryIcon(category: string) {
  switch (category) {
    case 'driver':
      return User;
    case 'vehicle':
      return Truck;
    case 'schedule':
      return MapPin;
    case 'finance':
    case 'business':
      return Wallet;
    case 'capacity':
      return Package;
    default:
      return ShieldAlert;
  }
}

function ConflictRow({
  conflict,
  canResolve,
  onIgnore,
  onResolve,
  onAction,
  busy,
}: {
  conflict: DispatchConflict;
  canResolve: boolean;
  onIgnore: (id: string) => void;
  onResolve: (id: string) => void;
  onAction?: (action: string, conflict: DispatchConflict) => void;
  busy?: boolean;
}) {
  const style = SEVERITY_STYLES[conflict.severity];
  const Icon = categoryIcon(conflict.category);
  const dimmed = conflict.ignored || conflict.resolved;

  return (
    <li
      className={cn(
        'rounded-lg border border-border/70 bg-card p-3 ring-1 ring-inset',
        style.ring,
        dimmed && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-8 w-8 items-center justify-center rounded-full', style.badge)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{conflict.message}</p>
            <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', style.badge)}>
              {style.label}
            </Badge>
            {conflict.ignored ? (
              <Badge variant="outline" className="h-5 text-[10px]">
                Ignored
              </Badge>
            ) : null}
            {conflict.resolved ? (
              <Badge variant="outline" className="h-5 text-[10px]">
                Resolved
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{conflict.description}</p>
          <p className="mt-1.5 text-xs font-medium text-foreground">{conflict.recommendation}</p>
          {canResolve && !dimmed ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {conflict.recommendations
                .filter((r) => r.action !== 'ignore' && r.action !== 'recheck')
                .slice(0, 2)
                .map((rec) => (
                  <Button
                    key={rec.action}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={busy}
                    onClick={() => onAction?.(rec.action, conflict)}
                  >
                    {rec.label}
                  </Button>
                ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={busy}
                onClick={() => onIgnore(conflict.id)}
              >
                Ignore
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={busy}
                onClick={() => onResolve(conflict.id)}
              >
                Mark resolved
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export interface DispatchConflictPanelProps {
  dispatchId: string;
  role?: MembershipRole;
  enabled?: boolean;
  compact?: boolean;
  className?: string;
  onSwapDriver?: () => void;
  onSwapVehicle?: () => void;
  onReschedule?: () => void;
}

export function DispatchConflictPanel({
  dispatchId,
  role,
  enabled = true,
  compact = false,
  className,
  onSwapDriver,
  onSwapVehicle,
  onReschedule,
}: DispatchConflictPanelProps) {
  const { data, isPending, isError, refetch, isFetching } = useDispatchConflicts(
    dispatchId,
    enabled,
  );
  const recheckMutation = useCheckDispatchConflicts(dispatchId);
  const ignoreMutation = useIgnoreDispatchConflict(dispatchId);
  const resolveMutation = useResolveDispatchConflict(dispatchId);
  const canResolve = Boolean(role && DISPATCH_WRITE_ROLES.includes(role));

  const open = useMemo(() => activeConflicts(data), [data]);
  const history = useMemo(
    () => data?.items.filter((c) => c.ignored || c.resolved) ?? [],
    [data],
  );
  const busy =
    ignoreMutation.isPending ||
    resolveMutation.isPending ||
    recheckMutation.isPending ||
    isFetching;

  const handleAction = (action: string) => {
    if (action === 'swap_driver') onSwapDriver?.();
    else if (action === 'swap_vehicle') onSwapVehicle?.();
    else if (action === 'reschedule' || action === 'larger_vehicle') onReschedule?.();
  };

  const handleIgnore = async (conflictId: string) => {
    try {
      await ignoreMutation.mutateAsync(conflictId);
      toast.success('Conflict ignored');
    } catch (err) {
      toast.error(describeError(err, 'Failed to ignore conflict'));
    }
  };

  const handleResolve = async (conflictId: string) => {
    try {
      await resolveMutation.mutateAsync(conflictId);
      toast.success('Conflict marked resolved');
    } catch (err) {
      toast.error(describeError(err, 'Failed to resolve conflict'));
    }
  };

  const handleRecheck = async () => {
    try {
      await recheckMutation.mutateAsync({ recordAudit: true });
      toast.success('Conflicts rechecked');
    } catch (err) {
      toast.error(describeError(err, 'Failed to recheck conflicts'));
    }
  };

  if (isPending) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking conflicts…
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn('text-sm text-destructive', className)}>
        Failed to load conflicts.{' '}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={cn(
              'h-4 w-4',
              (summary?.unresolved ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          />
          <p className="text-sm font-semibold text-foreground">
            Conflicts
            {(summary?.unresolved ?? 0) > 0 ? (
              <span className="ml-1.5 text-destructive">({summary?.unresolved})</span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => void handleRecheck()}
          disabled={busy}
        >
          <RefreshCw className={cn('mr-1 h-3 w-3', isFetching && 'animate-spin')} />
          Recheck
        </Button>
      </div>

      {!compact && summary ? (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {summary.critical > 0 ? (
            <Badge className={SEVERITY_STYLES.critical.badge}>{summary.critical} critical</Badge>
          ) : null}
          {summary.high > 0 ? (
            <Badge className={SEVERITY_STYLES.high.badge}>{summary.high} high</Badge>
          ) : null}
          {summary.medium > 0 ? (
            <Badge className={SEVERITY_STYLES.medium.badge}>{summary.medium} medium</Badge>
          ) : null}
          {summary.low > 0 ? (
            <Badge className={SEVERITY_STYLES.low.badge}>{summary.low} low</Badge>
          ) : null}
        </div>
      ) : null}

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active conflicts detected.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((conflict) => (
            <ConflictRow
              key={conflict.id}
              conflict={conflict}
              canResolve={canResolve}
              busy={busy}
              onIgnore={handleIgnore}
              onResolve={handleResolve}
              onAction={handleAction}
            />
          ))}
        </ul>
      )}

      {!compact && history.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </p>
          <ul className="space-y-2">
            {history.slice(0, 3).map((conflict) => (
              <ConflictRow
                key={`hist-${conflict.id}`}
                conflict={conflict}
                canResolve={false}
                onIgnore={() => undefined}
                onResolve={() => undefined}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
