import { useState } from 'react';
import {
  useOptimizePreviewMutation,
  useOptimizeApplyMutation,
  type ApiRoute,
  type ApiRouteStop,
  type OptimizationPreview,
} from '@/lib/api/routes';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Loader2,
  Navigation,
  RotateCcw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api/error';

const OptimizeIcon = Navigation;

const ACTIVE_DISPATCH_STATUSES = new Set([
  'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_STOP', 'ARRIVED_AT_DELIVERY',
]);

function getFixedReason(stop: ApiRouteStop): 'locked' | 'completed' | 'active' | null {
  if (stop.optimizationLocked) return 'locked';
  if (stop.status === 'COMPLETED' || stop.status === 'SKIPPED') return 'completed';
  if (stop.dispatch) {
    if (ACTIVE_DISPATCH_STATUSES.has(stop.dispatch.status)) return 'active';
    if (stop.dispatch.stops.some((ds) => ds.arrivedAt != null)) return 'active';
  }
  return null;
}

function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface StopSequenceRowProps {
  currentSeq: number;
  proposedSeq: number;
  address: string;
  changed: boolean;
  fixedReason: 'locked' | 'completed' | 'active' | null;
}

function StopSequenceRow({ currentSeq, proposedSeq, address, changed, fixedReason }: StopSequenceRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        changed ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-muted/20',
        fixedReason && 'opacity-70',
      )}
    >
      <div className="flex min-w-[80px] items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
        <span className={cn('font-mono', changed && 'text-amber-600 dark:text-amber-400 line-through')}>
          #{currentSeq}
        </span>
        {changed && (
          <>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-mono font-semibold text-primary">#{proposedSeq}</span>
          </>
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-foreground">{address}</p>
      {fixedReason === 'locked' && (
        <Lock className="h-3 w-3 shrink-0 text-amber-500" aria-label="Locked" />
      )}
      {fixedReason === 'completed' && (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-label="Completed" />
      )}
      {fixedReason === 'active' && (
        <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
          Active
        </span>
      )}
    </div>
  );
}

interface RouteOptimizationPreviewProps {
  route: ApiRoute;
  onClose: () => void;
}

export function RouteOptimizationPreview({ route, onClose }: RouteOptimizationPreviewProps) {
  const [preview, setPreview] = useState<OptimizationPreview | null>(null);
  const { mutate: doPreview, isPending: isPreviewing } = useOptimizePreviewMutation(route.id);
  const { mutate: doApply, isPending: isApplying } = useOptimizeApplyMutation(route.id);

  const handlePreview = () => {
    doPreview(undefined, {
      onSuccess: (data) => setPreview(data),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Preview failed'),
    });
  };

  const handleApply = () => {
    if (!preview) return;
    doApply(preview.routeUpdatedAt, {
      onSuccess: (res) => {
        toast.success(
          res.changedStopIds.length > 0
            ? `Route optimized — ${res.changedStopIds.length} stop${res.changedStopIds.length !== 1 ? 's' : ''} reordered`
            : 'Route is already optimal',
        );
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error('Route changed since preview — fetching new preview…');
          setPreview(null);
          handlePreview();
        } else {
          toast.error(err instanceof Error ? err.message : 'Apply failed');
        }
      },
    });
  };

  const stopById = new Map(route.stops.map((s) => [s.id, s]));
  const changedIds = new Set(preview?.changedStopIds ?? []);

  const canOptimize = route.status !== 'COMPLETED' && route.status !== 'CANCELLED';

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <OptimizeIcon className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">Optimize Route</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close optimization panel"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Warnings */}
        {preview && preview.warnings.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2">
            {preview.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Fixed / missing-coord info */}
        {preview && (preview.fixedCount > 0 || preview.missingCoordCount > 0) && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {preview.fixedCount > 0 && (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3 text-amber-500" aria-hidden />
                {preview.fixedCount} stop{preview.fixedCount !== 1 ? 's' : ''} fixed
              </span>
            )}
            {preview.missingCoordCount > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
                {preview.missingCoordCount} missing coords
              </span>
            )}
          </div>
        )}

        {/* Metrics comparison — shown whenever a preview exists */}
        {preview && (
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/40 bg-muted/10 p-3 text-center">
            <MetricCell label="Current" value={formatKm(preview.currentDistance)} />
            <MetricCell
              label="Optimized"
              value={formatKm(preview.optimizedDistance)}
              highlight={preview.distanceSaved > 0}
            />
            <MetricCell
              label="Saved"
              value={preview.distanceSaved > 0 ? `−${formatKm(preview.distanceSaved)}` : '—'}
              tone={preview.distanceSaved > 0 ? 'success' : 'neutral'}
            />
          </div>
        )}

        {/* Proposed sequence */}
        {preview && preview.optimized && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Proposed order
              {preview.changedStopIds.length > 0 && (
                <span className="ml-1.5 font-normal normal-case text-primary">
                  ({preview.changedStopIds.length} change{preview.changedStopIds.length !== 1 ? 's' : ''})
                </span>
              )}
            </p>
            <div className="flex flex-col gap-1">
              {[...preview.proposedSequence]
                .sort((a, b) => a.sequence - b.sequence)
                .map((entry) => {
                  const stop = stopById.get(entry.id);
                  const currentEntry = preview.currentSequence.find((c) => c.id === entry.id);
                  return (
                    <StopSequenceRow
                      key={entry.id}
                      currentSeq={currentEntry?.sequence ?? entry.sequence}
                      proposedSeq={entry.sequence}
                      address={stop ? (stop.label ?? `${stop.address}, ${stop.city}`) : entry.id}
                      changed={changedIds.has(entry.id)}
                      fixedReason={stop ? getFixedReason(stop) : null}
                    />
                  );
                })}
            </div>
          </div>
        )}

        {preview && !preview.optimized && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
            {preview.fixedCount > 0
              ? `Route is already optimal. ${preview.fixedCount} stop${preview.fixedCount !== 1 ? 's' : ''} fixed in place.`
              : 'Route is already optimal — no improvement found.'}
          </div>
        )}

        {/* Action buttons */}
        {!preview ? (
          <Button
            onClick={handlePreview}
            disabled={isPreviewing || !canOptimize}
            className="w-full gap-2"
            title={!canOptimize ? `Cannot optimize a ${route.status} route` : undefined}
          >
            {isPreviewing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <OptimizeIcon className="h-4 w-4" aria-hidden />
            )}
            {isPreviewing ? 'Analyzing…' : 'Preview Optimization'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isApplying}
              className="flex-1"
            >
              Keep Current
            </Button>
            {preview.optimized && preview.changedStopIds.length > 0 && (
              <Button
                onClick={handleApply}
                disabled={isApplying}
                className="flex-1 gap-1.5"
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                {isApplying ? 'Applying…' : 'Apply'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreview}
              disabled={isPreviewing || isApplying}
              className="px-2"
              title="Refresh preview"
            >
              {isPreviewing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'success' | 'neutral';
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums',
          highlight ? 'text-primary' : '',
          tone === 'success' ? 'text-success' : '',
        )}
      >
        {value}
      </p>
    </div>
  );
}
