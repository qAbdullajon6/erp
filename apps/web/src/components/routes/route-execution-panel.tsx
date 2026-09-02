import type { ApiRoute } from '@/lib/api/routes';
import { cn } from '@/lib/utils';
import {
  computeRouteProgress,
  deriveStopExecutionState,
  findCurrentStop,
  findNextStop,
} from './route-execution-state';
import { Navigation } from 'lucide-react';

interface RouteExecutionPanelProps {
  route: ApiRoute;
}

export function RouteExecutionPanel({ route }: RouteExecutionPanelProps) {
  const progress = computeRouteProgress(route.stops);
  const currentStop = findCurrentStop(route.stops);
  const nextStop = findNextStop(route.stops, currentStop);
  const failedStops = route.stops.filter(
    (s) => deriveStopExecutionState(s.dispatch) === 'FAILED',
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/30 bg-card">
      <div className="flex items-center gap-2 border-b border-border/40 bg-brand/5 px-5 py-3.5">
        <Navigation className="h-4 w-4 text-brand" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Execution Progress</h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {progress.completed} / {progress.total} stops
        </span>
      </div>

      <div className="space-y-4 p-5">
        {/* Progress bar */}
        <div>
          <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{progress.percentage}% complete</span>
            {progress.failed > 0 && (
              <span className="text-destructive">{progress.failed} failed</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        {/* Count chips */}
        <div className="flex flex-wrap gap-2">
          <CountChip label="Done" value={progress.completed} tone="text-success" />
          {progress.active > 0 && (
            <CountChip label="Active" value={progress.active} tone="text-brand" pulse />
          )}
          {progress.failed > 0 && (
            <CountChip label="Failed" value={progress.failed} tone="text-destructive" />
          )}
          <CountChip label="Remaining" value={progress.upcoming} tone="text-muted-foreground" />
        </div>

        {/* Current stop */}
        {currentStop && (
          <div className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand">
              Current Stop
            </p>
            <p className="text-sm font-semibold text-foreground">
              #{currentStop.sequence} {currentStop.label ?? currentStop.city}
            </p>
            <p className="text-xs text-muted-foreground">
              {currentStop.address}, {currentStop.city}
            </p>
            {currentStop.dispatch && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {currentStop.dispatch.dispatchNumber} ·{' '}
                {formatExecutionState(deriveStopExecutionState(currentStop.dispatch))}
              </p>
            )}
          </div>
        )}

        {/* Next stop */}
        {nextStop && (
          <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Next Stop
            </p>
            <p className="text-sm font-medium text-foreground">
              #{nextStop.sequence} {nextStop.label ?? nextStop.city}
            </p>
            <p className="text-xs text-muted-foreground">
              {nextStop.address}, {nextStop.city}
            </p>
          </div>
        )}

        {/* Failed stops */}
        {failedStops.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
              Failed Stops
            </p>
            {failedStops.map((stop) => (
              <div
                key={stop.id}
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
              >
                <p className="text-xs font-semibold text-destructive">
                  #{stop.sequence} {stop.label ?? stop.city}
                </p>
                {stop.dispatch?.failureReason && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {stop.dispatch.failureReason.replace(/_/g, ' ')}
                  </p>
                )}
                {stop.dispatch?.failureNotes && (
                  <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                    {stop.dispatch.failureNotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountChip({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: number;
  tone: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1">
      <span className={cn('text-xs font-bold tabular-nums', tone, pulse && 'animate-pulse')}>
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function formatExecutionState(state: ReturnType<typeof deriveStopExecutionState>): string {
  switch (state) {
    case 'EN_ROUTE': return 'En route';
    case 'AT_STOP': return 'At stop';
    case 'COMPLETED': return 'Completed';
    case 'FAILED': return 'Failed';
    case 'CANCELLED': return 'Cancelled';
    case 'UPCOMING': return 'Upcoming';
    default: return '—';
  }
}
