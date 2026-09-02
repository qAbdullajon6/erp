import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ApiRouteStop, ApiRoute } from '@/lib/api/routes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatRouteDistance,
  formatRouteDuration,
  STOP_STATUS_COLORS,
  STOP_STATUS_LABELS,
} from './route-utils';
import { deriveStopExecutionState } from './route-execution-state';
import { countStopsMissingCoordinates, formatETA } from './route-metrics-utils';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  ExternalLink,
  Link,
  Lock,
  LockOpen,
  MapPin,
  Package,
  Plus,
  Trash2,
  Unlink,
} from 'lucide-react';

const INPUT_CLASS =
  'w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

export interface AddStopData {
  label?: string;
  address: string;
  city: string;
  dispatchId?: string;
  orderId?: string;
}

interface RouteStopListProps {
  route: ApiRoute;
  canEdit: boolean;
  isAddingStop: boolean;
  onAddStop: (data: AddStopData) => void;
  onRemoveStop: (stopId: string) => void;
  onMoveUp: (stop: ApiRouteStop) => void;
  onMoveDown: (stop: ApiRouteStop) => void;
  onToggleLock?: (stop: ApiRouteStop) => void;
  onLinkDispatch?: (stop: ApiRouteStop, dispatchId: string) => void;
  onUnlinkDispatch?: (stop: ApiRouteStop) => void;
}

export function RouteStopList({
  route,
  canEdit,
  isAddingStop,
  onAddStop,
  onRemoveStop,
  onMoveUp,
  onMoveDown,
  onToggleLock,
  onLinkDispatch,
  onUnlinkDispatch,
}: RouteStopListProps) {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [newStop, setNewStop] = useState({ label: '', address: '', city: '', dispatchId: '', orderId: '' });
  const [addErrors, setAddErrors] = useState<{ address?: string; city?: string }>({});

  const orderedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const missingCoordCount = countStopsMissingCoordinates(route.stops);

  const handleAdd = () => {
    const errors: { address?: string; city?: string } = {};
    if (!newStop.address.trim()) errors.address = 'Required';
    if (!newStop.city.trim()) errors.city = 'Required';
    if (Object.keys(errors).length > 0) { setAddErrors(errors); return; }
    onAddStop({
      address: newStop.address,
      city: newStop.city,
      label: newStop.label || undefined,
      dispatchId: newStop.dispatchId.trim() || undefined,
      orderId: newStop.orderId.trim() || undefined,
    });
    setNewStop({ label: '', address: '', city: '', dispatchId: '', orderId: '' });
    setAddErrors({});
    setShowAdd(false);
  };

  const handleCancelAdd = () => {
    setShowAdd(false);
    setNewStop({ label: '', address: '', city: '', dispatchId: '', orderId: '' });
    setAddErrors({});
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 bg-card px-5 py-3.5">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">
            Stops
          </h2>
          <span className="text-sm text-muted-foreground">
            ({orderedStops.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {missingCoordCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {missingCoordCount} missing {missingCoordCount === 1 ? 'coord' : 'coords'}
            </span>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAdd(!showAdd)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add Stop
            </Button>
          )}
        </div>
      </div>

      {/* Add stop form */}
      {showAdd && (
        <div className="border-b border-border/40 bg-muted/10 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            New Stop
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Label <span className="text-[10px]">(optional)</span>
              </label>
              <input
                value={newStop.label}
                onChange={(e) => setNewStop((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Warehouse A"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Address <span className="text-destructive">*</span>
              </label>
              <input
                value={newStop.address}
                onChange={(e) => setNewStop((p) => ({ ...p, address: e.target.value }))}
                placeholder="Street address"
                className={cn(INPUT_CLASS, addErrors.address && 'border-destructive')}
              />
              {addErrors.address && (
                <p className="mt-0.5 text-xs text-destructive">{addErrors.address}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                City <span className="text-destructive">*</span>
              </label>
              <input
                value={newStop.city}
                onChange={(e) => setNewStop((p) => ({ ...p, city: e.target.value }))}
                placeholder="City"
                className={cn(INPUT_CLASS, addErrors.city && 'border-destructive')}
              />
              {addErrors.city && (
                <p className="mt-0.5 text-xs text-destructive">{addErrors.city}</p>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Dispatch ID <span className="text-[10px]">(optional)</span>
              </label>
              <input
                value={newStop.dispatchId}
                onChange={(e) => setNewStop((p) => ({ ...p, dispatchId: e.target.value }))}
                placeholder="Paste dispatch UUID"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Order ID <span className="text-[10px]">(optional)</span>
              </label>
              <input
                value={newStop.orderId}
                onChange={(e) => setNewStop((p) => ({ ...p, orderId: e.target.value }))}
                placeholder="Paste order UUID"
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={isAddingStop}>
              {isAddingStop ? 'Adding…' : 'Add'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancelAdd}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {orderedStops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <MapPin className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">No stops yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canEdit
              ? 'Use "Add Stop" above to build the route sequence.'
              : 'No stops have been added to this route.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {orderedStops.map((stop, idx) => (
            <RouteStopRow
              key={stop.id}
              stop={stop}
              idx={idx}
              total={orderedStops.length}
              canEdit={canEdit}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onRemove={onRemoveStop}
              onToggleLock={onToggleLock}
              onLinkDispatch={onLinkDispatch}
              onUnlinkDispatch={onUnlinkDispatch}
              onNavigateToDispatch={(dispatchId) =>
                navigate({ to: '/app/dispatches/$dispatchId', params: { dispatchId } })
              }
              onNavigateToOrder={(orderId) =>
                navigate({ to: '/app/orders/$orderId', params: { orderId } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutionStateBadge({ dispatch }: { dispatch: ApiRouteStop['dispatch'] }) {
  const state = deriveStopExecutionState(dispatch);
  if (!state) return null;

  const config: Record<string, { label: string; className: string }> = {
    EN_ROUTE: { label: 'En route', className: 'border-brand/30 bg-brand/10 text-brand' },
    AT_STOP: { label: 'At stop', className: 'border-brand/30 bg-brand/10 text-brand' },
    COMPLETED: { label: 'Delivered', className: 'border-success/30 bg-success/10 text-success' },
    FAILED: { label: 'Failed', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
    CANCELLED: { label: 'Cancelled', className: 'border-border/50 bg-muted/30 text-muted-foreground' },
    UPCOMING: { label: 'Upcoming', className: 'border-border/40 bg-muted/20 text-muted-foreground' },
  };

  const c = config[state];
  if (!c) return null;

  return (
    <span
      className={cn(
        'rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        c.className,
      )}
    >
      {c.label}
    </span>
  );
}

interface RouteStopRowProps {
  stop: ApiRouteStop;
  idx: number;
  total: number;
  canEdit: boolean;
  onMoveUp: (stop: ApiRouteStop) => void;
  onMoveDown: (stop: ApiRouteStop) => void;
  onRemove: (stopId: string) => void;
  onToggleLock?: (stop: ApiRouteStop) => void;
  onLinkDispatch?: (stop: ApiRouteStop, dispatchId: string) => void;
  onUnlinkDispatch?: (stop: ApiRouteStop) => void;
  onNavigateToDispatch: (dispatchId: string) => void;
  onNavigateToOrder: (orderId: string) => void;
}

function RouteStopRow({
  stop,
  idx,
  total,
  canEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
  onToggleLock,
  onLinkDispatch,
  onUnlinkDispatch,
  onNavigateToDispatch,
  onNavigateToOrder,
}: RouteStopRowProps) {
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkDispatchId, setLinkDispatchId] = useState('');
  const isFirst = idx === 0;
  const isLast = idx === total - 1;

  return (
    <div className="group flex items-start gap-4 px-5 py-4">
      {/* Connector + sequence */}
      <div className="flex shrink-0 flex-col items-center">
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
            stop.status === 'COMPLETED'
              ? 'bg-success/15 text-success'
              : stop.status === 'SKIPPED'
                ? 'bg-amber-400/15 text-amber-600 dark:text-amber-400'
                : 'bg-brand/10 text-brand',
          )}
        >
          {stop.sequence}
        </div>
        {/* Connector line to next stop */}
        {!isLast && (
          <div className="mt-1 w-px flex-1 border-l border-dashed border-border/40" style={{ minHeight: 16 }} />
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {stop.label ?? stop.city}
          </span>
          <span
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
              STOP_STATUS_COLORS[stop.status],
            )}
          >
            {STOP_STATUS_LABELS[stop.status]}
          </span>
          <ExecutionStateBadge dispatch={stop.dispatch} />
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {stop.address}, {stop.city}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {stop.plannedArrival && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" aria-hidden />
              ETA {formatETA(stop.plannedArrival)}
            </span>
          )}
          {stop.distanceFromPrevM != null && idx > 0 && (
            <span>
              +{formatRouteDistance(stop.distanceFromPrevM)}{' '}
              {stop.durationFromPrevSec != null && `· +${formatRouteDuration(stop.durationFromPrevSec)}`}
            </span>
          )}

          {/* Order link */}
          {stop.order && (
            <button
              type="button"
              onClick={() => onNavigateToOrder(stop.order!.id)}
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <Package className="h-3 w-3" aria-hidden />
              {stop.order.orderNumber}
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
            </button>
          )}

          {/* Dispatch link */}
          {stop.dispatch && (
            <button
              type="button"
              onClick={() => onNavigateToDispatch(stop.dispatch!.id)}
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <ChevronRight className="h-3 w-3" aria-hidden />
              {stop.dispatch.dispatchNumber}
              <span className="text-muted-foreground">· {stop.dispatch.status.replace(/_/g, ' ')}</span>
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
            </button>
          )}
        </div>

        {stop.notes && (
          <p className="mt-1 text-[11px] italic text-muted-foreground">{stop.notes}</p>
        )}

        {/* Inline link-dispatch form */}
        {canEdit && showLinkForm && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={linkDispatchId}
              onChange={(e) => setLinkDispatchId(e.target.value)}
              placeholder="Paste dispatch UUID"
              className={cn(INPUT_CLASS, 'flex-1 text-xs py-1 px-2')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && linkDispatchId.trim()) {
                  onLinkDispatch?.(stop, linkDispatchId.trim());
                  setLinkDispatchId('');
                  setShowLinkForm(false);
                }
                if (e.key === 'Escape') {
                  setShowLinkForm(false);
                  setLinkDispatchId('');
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                if (linkDispatchId.trim()) {
                  onLinkDispatch?.(stop, linkDispatchId.trim());
                  setLinkDispatchId('');
                  setShowLinkForm(false);
                }
              }}
            >
              Link
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => { setShowLinkForm(false); setLinkDispatchId(''); }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Reorder + lock + remove */}
      {canEdit && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Link / Unlink dispatch */}
          {onLinkDispatch && !stop.dispatch && (
            <button
              type="button"
              onClick={() => setShowLinkForm(true)}
              aria-label="Link dispatch to stop"
              title="Link a dispatch to this stop"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Link className="h-3.5 w-3.5" />
            </button>
          )}
          {onUnlinkDispatch && stop.dispatch && (
            <button
              type="button"
              onClick={() => onUnlinkDispatch(stop)}
              aria-label="Unlink dispatch from stop"
              title={`Unlink ${stop.dispatch.dispatchNumber}`}
              className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          )}
          {onToggleLock && (
            <button
              type="button"
              onClick={() => onToggleLock(stop)}
              aria-label={stop.optimizationLocked ? 'Unlock stop from optimization' : 'Lock stop from optimization'}
              title={stop.optimizationLocked ? 'Locked — click to unlock' : 'Lock position during optimization'}
              className={cn(
                'rounded p-1.5 transition-colors',
                stop.optimizationLocked
                  ? 'text-amber-600 hover:bg-amber-400/10 dark:text-amber-400'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {stop.optimizationLocked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <LockOpen className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onMoveUp(stop)}
            disabled={isFirst}
            aria-label="Move stop up"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(stop)}
            disabled={isLast}
            aria-label="Move stop down"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(stop.id)}
            aria-label="Remove stop"
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
