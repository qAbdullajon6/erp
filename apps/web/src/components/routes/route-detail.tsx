import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  useRoute,
  useUpdateRouteMutation,
  useAddRouteStopMutation,
  useRemoveRouteStopMutation,
  useReorderRouteStopsMutation,
  useCalculateRouteMutation,
  useUpdateRouteStopMutation,
  type ApiRouteStop,
  type RouteStatus,
} from '@/lib/api/routes';
import { useAvailability } from '@/lib/api/availability';
import { useTrackingVehicleQuery } from '@/lib/api/tracking';
import { Button } from '@/components/ui/button';
import { StatChip } from '@/components/ui/stat-chip';
import { ListSkeleton, ErrorState } from '@/components/shared/list-states';
import { RouteStatusBadge } from './route-status-badge';
import { RouteStopList } from './route-stop-list';
import { RouteMap } from './route-map';
import { RouteExecutionPanel } from './route-execution-panel';
import { RouteOptimizationPreview } from './route-optimization-preview';
import { findCurrentStop } from './route-execution-state';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatRouteDistance, formatRouteDuration } from './route-utils';
import { countStopsMissingCoordinates } from './route-metrics-utils';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Save,
  Shuffle,
  Timer,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SELECT_CLASS =
  'w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';

const INPUT_CLASS =
  'w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

interface RouteDetailProps {
  routeId: string;
}

export function RouteDetail({ routeId }: RouteDetailProps) {
  const navigate = useNavigate();
  const { data: route, isLoading, error, refetch } = useRoute(routeId);
  const { mutate: updateRoute, isPending: isUpdating } = useUpdateRouteMutation(routeId);
  const { mutate: addStop, isPending: isAddingStop } = useAddRouteStopMutation(routeId);
  const { mutate: removeStop } = useRemoveRouteStopMutation(routeId);
  const { mutate: reorderStops } = useReorderRouteStopsMutation(routeId);
  const { mutate: calculate, isPending: isCalculating } = useCalculateRouteMutation(routeId);
  const { mutate: updateStop } = useUpdateRouteStopMutation(routeId);

  const [showOptimization, setShowOptimization] = useState(false);

  const isActive = route?.status === 'IN_PROGRESS';

  // Poll every 30s while route is IN_PROGRESS
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(refetch, 30_000);
    return () => clearInterval(timer);
  }, [isActive, refetch]);

  const { data: liveVehicle } = useTrackingVehicleQuery(route?.vehicleId ?? null, {
    enabled: isActive,
    refetchInterval: isActive ? 30_000 : false,
  });

  const vehiclePosition =
    liveVehicle?.latitude != null && liveVehicle?.longitude != null
      ? { lat: liveVehicle.latitude, lng: liveVehicle.longitude, heading: liveVehicle.heading }
      : null;

  const TERMINAL_DISPATCH = ['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'] as const;
  const activeDispatchCount = (route?.stops ?? []).filter(
    (s) => s.dispatch && !(TERMINAL_DISPATCH as readonly string[]).includes(s.dispatch.status),
  ).length;

  // Assignment editing state
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [draftDriverId, setDraftDriverId] = useState('');
  const [draftVehicleId, setDraftVehicleId] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftNotes, setDraftNotes] = useState('');

  const { data: availability, loading: availLoading } = useAvailability(
    route
      ? { pickupDate: draftDate || route.plannedDate, deliveryDate: draftDate || route.plannedDate }
      : undefined,
    { enabled: editingAssignment },
  );

  if (isLoading) return <ListSkeleton rows={4} label="Loading route" />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={refetch} />;
  if (!route) return null;

  const canEdit = route.status === 'DRAFT' || route.status === 'PLANNED';
  const isTerminal = route.status === 'COMPLETED' || route.status === 'CANCELLED';

  const startEdit = () => {
    setDraftDriverId(route.driverId ?? '');
    setDraftVehicleId(route.vehicleId ?? '');
    setDraftDate(route.plannedDate);
    setDraftNotes(route.notes ?? '');
    setEditingAssignment(true);
  };

  const cancelEdit = () => setEditingAssignment(false);

  const saveAssignment = () => {
    updateRoute(
      {
        driverId: draftDriverId || undefined,
        vehicleId: draftVehicleId || undefined,
        plannedDate: draftDate || undefined,
        notes: draftNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Route updated');
          setEditingAssignment(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update route'),
      },
    );
  };

  const handleStatusChange = (status: RouteStatus) => {
    if (status === 'CANCELLED') {
      if (!window.confirm('Cancel this route? This action cannot be undone.')) return;
    }
    updateRoute(
      { status },
      {
        onSuccess: () =>
          toast.success(
            status === 'PLANNED'
              ? 'Route confirmed'
              : status === 'IN_PROGRESS'
                ? 'Route started'
                : status === 'COMPLETED'
                  ? 'Route completed'
                  : 'Route cancelled',
          ),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update route'),
      },
    );
  };

  const handleAddStop = (data: { label?: string; address: string; city: string; dispatchId?: string; orderId?: string }) => {
    addStop(data, {
      onSuccess: () => toast.success('Stop added'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add stop'),
    });
  };

  const handleRemoveStop = (stopId: string) => {
    removeStop(stopId, {
      onSuccess: () => toast.success('Stop removed'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove stop'),
    });
  };

  const handleMoveUp = (stop: ApiRouteStop) => {
    const sorted = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    const idx = sorted.findIndex((s) => s.id === stop.id);
    if (idx <= 0) return;
    const next = [...sorted];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    reorderStops(next.map((s) => s.id), {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to reorder'),
    });
  };

  const handleMoveDown = (stop: ApiRouteStop) => {
    const sorted = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    const idx = sorted.findIndex((s) => s.id === stop.id);
    if (idx >= sorted.length - 1) return;
    const next = [...sorted];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    reorderStops(next.map((s) => s.id), {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to reorder'),
    });
  };

  const handleCalculate = () => {
    calculate(undefined, {
      onSuccess: (res) => toast.success(res.message ?? 'Route calculated'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Calculation failed'),
    });
  };

  const handleToggleLock = (stop: ApiRouteStop) => {
    updateStop(
      { stopId: stop.id, data: { optimizationLocked: !stop.optimizationLocked } },
      {
        onSuccess: () =>
          toast.success(stop.optimizationLocked ? 'Stop unlocked' : 'Stop locked from optimization'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update stop'),
      },
    );
  };

  const handleLinkDispatch = (stop: ApiRouteStop, dispatchId: string) => {
    updateStop(
      { stopId: stop.id, data: { dispatchId } },
      {
        onSuccess: () => toast.success('Dispatch linked to stop'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to link dispatch'),
      },
    );
  };

  const handleUnlinkDispatch = (stop: ApiRouteStop) => {
    updateStop(
      { stopId: stop.id, data: { dispatchId: null } },
      {
        onSuccess: () => toast.success('Dispatch unlinked from stop'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to unlink dispatch'),
      },
    );
  };

  const hasCoords = route.stops.some((s) => s.lat != null);
  const missingCoordCount = countStopsMissingCoordinates(route.stops);

  return (
    <div className="flex flex-col gap-5">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate({ to: '/app/routes' })}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All Routes
      </button>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          {/* Title block */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold text-foreground">
                {route.routeNumber}
              </h1>
              <RouteStatusBadge status={route.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {formatDate(route.plannedDate)}
              </span>
              {route.driver && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" aria-hidden />
                  {route.driver.firstName} {route.driver.lastName}
                </span>
              )}
              {route.vehicle && (
                <span className="flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5" aria-hidden />
                  {route.vehicle.plateNumber} · {route.vehicle.vehicleCode}
                </span>
              )}
              {route.createdBy && (
                <span className="text-muted-foreground/60">
                  Created by {route.createdBy.firstName} {route.createdBy.lastName}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {hasCoords && !isTerminal && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCalculate}
                disabled={isCalculating || isUpdating}
                className="gap-1.5"
              >
                {isCalculating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Calculator className="h-3.5 w-3.5" aria-hidden />
                )}
                {isCalculating ? 'Calculating…' : 'Calculate'}
              </Button>
            )}
            {route.stops.length >= 2 && !isTerminal && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOptimization((v) => !v)}
                className="gap-1.5"
              >
                <Shuffle className="h-3.5 w-3.5" aria-hidden />
                Optimize
              </Button>
            )}

            {route.status === 'DRAFT' && (
              <>
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleStatusChange('PLANNED')}
                    disabled={isUpdating || route.stops.length === 0 || !route.driverId || !route.vehicleId}
                    title={
                      route.stops.length === 0
                        ? 'Add at least one stop first'
                        : !route.driverId || !route.vehicleId
                          ? 'Assign a driver and vehicle first'
                          : undefined
                    }
                    className="gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    Confirm Plan
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatusChange('CANCELLED')}
                  disabled={isUpdating}
                  className="gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                  Cancel
                </Button>
              </>
            )}

            {route.status === 'PLANNED' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStatusChange('IN_PROGRESS')}
                  disabled={isUpdating}
                  className="gap-1.5"
                >
                  <Navigation className="h-3.5 w-3.5" aria-hidden />
                  Start Route
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatusChange('CANCELLED')}
                  disabled={isUpdating}
                  className="gap-1.5"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                  Cancel
                </Button>
              </>
            )}

            {route.status === 'IN_PROGRESS' && (
              <Button
                size="sm"
                onClick={() => handleStatusChange('COMPLETED')}
                disabled={isUpdating || activeDispatchCount > 0}
                title={
                  activeDispatchCount > 0
                    ? `${activeDispatchCount} dispatch(es) still active — complete or cancel them first`
                    : undefined
                }
                className="gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Complete Route
              </Button>
            )}
          </div>
        </div>

        {/* Summary stat chips */}
        <div className="flex flex-wrap gap-3 border-t border-border/40 bg-muted/10 px-6 py-4">
          <StatChip
            icon={MapPin}
            label="Stops"
            value={route.stops.length}
            tone="text-brand"
          />
          <StatChip
            icon={RouteIcon}
            label="Distance"
            value={formatRouteDistance(route.totalDistanceM)}
            tone="text-muted-foreground"
          />
          <StatChip
            icon={Timer}
            label="Est. Duration"
            value={formatRouteDuration(route.totalDurationSec)}
            tone="text-muted-foreground"
          />
          {route.startTime && (
            <StatChip
              icon={CalendarDays}
              label="Start Time"
              value={formatDateTime(route.startTime)}
              tone="text-muted-foreground"
            />
          )}
          {route.calculatedAt && (
            <StatChip
              icon={Clock}
              label="Calculated"
              value={formatDateTime(route.calculatedAt)}
              tone={
                route.calculationStatus === 'SUCCESS'
                  ? 'text-success'
                  : route.calculationStatus === 'PARTIAL'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
              }
            />
          )}
          {missingCoordCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600/70 dark:text-amber-400/70">
                  Missing Coords
                </p>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {missingCoordCount} {missingCoordCount === 1 ? 'stop' : 'stops'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Execution panel — shown only when route is IN_PROGRESS */}
      {route.status === 'IN_PROGRESS' && <RouteExecutionPanel route={route} />}

      {/* Body: two-column layout on larger screens */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        {/* LEFT: Stop list */}
        <RouteStopList
          route={route}
          canEdit={canEdit}
          isAddingStop={isAddingStop}
          onLinkDispatch={canEdit ? handleLinkDispatch : undefined}
          onUnlinkDispatch={canEdit ? handleUnlinkDispatch : undefined}
          onAddStop={handleAddStop}
          onRemoveStop={handleRemoveStop}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onToggleLock={canEdit ? handleToggleLock : undefined}
        />

        {/* RIGHT: Sidebar */}
        <div className="flex flex-col gap-5">
          {/* Assignment card */}
          <AssignmentCard
            route={route}
            canEdit={canEdit && !isTerminal}
            editing={editingAssignment}
            draftDriverId={draftDriverId}
            draftVehicleId={draftVehicleId}
            draftDate={draftDate}
            draftNotes={draftNotes}
            availability={availability}
            availLoading={availLoading}
            isUpdating={isUpdating}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={saveAssignment}
            onDriverChange={setDraftDriverId}
            onVehicleChange={setDraftVehicleId}
            onDateChange={setDraftDate}
            onNotesChange={setDraftNotes}
          />

          {/* Optimization panel */}
          {showOptimization && (
            <RouteOptimizationPreview
              route={route}
              onClose={() => setShowOptimization(false)}
            />
          )}

          {/* Map */}
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
            <div className="border-b border-border/40 px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Route Map</h3>
            </div>
            <div className="p-3">
              <RouteMap
                stops={route.stops}
                vehiclePosition={vehiclePosition}
                currentStopSequence={findCurrentStop(route.stops)?.sequence ?? null}
                geometry={route.geometry}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Assignment sidebar card ────────────────────────────────────────────────

interface AssignmentCardProps {
  route: ReturnType<typeof useRoute>['data'] & {};
  canEdit: boolean;
  editing: boolean;
  draftDriverId: string;
  draftVehicleId: string;
  draftDate: string;
  draftNotes: string;
  availability: { drivers: { id: string; employeeCode: string; firstName: string; lastName: string }[]; vehicles: { id: string; vehicleCode: string; plateNumber: string; type: string }[] } | null | undefined;
  availLoading: boolean;
  isUpdating: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDriverChange: (v: string) => void;
  onVehicleChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onNotesChange: (v: string) => void;
}

function AssignmentCard({
  route,
  canEdit,
  editing,
  draftDriverId,
  draftVehicleId,
  draftDate,
  draftNotes,
  availability,
  availLoading,
  isUpdating,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDriverChange,
  onVehicleChange,
  onDateChange,
  onNotesChange,
}: AssignmentCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Assignment</h3>
        {canEdit && !editing && (
          <Button size="sm" variant="ghost" onClick={onStartEdit} className="h-7 text-xs">
            Edit
          </Button>
        )}
      </div>

      <div className="space-y-3 p-4">
        {!editing ? (
          // Read-only view
          <>
            <AssignmentField
              icon={<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
              label="Planned Date"
              value={formatDate(route!.plannedDate)}
            />
            <AssignmentField
              icon={<User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
              label="Driver"
              value={
                route!.driver
                  ? `${route!.driver.firstName} ${route!.driver.lastName}`
                  : undefined
              }
              empty="No driver assigned"
            />
            <AssignmentField
              icon={<Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
              label="Vehicle"
              value={
                route!.vehicle
                  ? `${route!.vehicle.plateNumber} · ${route!.vehicle.vehicleCode}`
                  : undefined
              }
              empty="No vehicle assigned"
            />
            {route!.notes && (
              <div className="rounded-lg bg-muted/30 px-3 py-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="text-xs text-foreground">{route!.notes}</p>
              </div>
            )}
          </>
        ) : (
          // Edit form
          <>
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarDays className="h-3 w-3" aria-hidden />
                Planned Date
              </label>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => {
                  onDateChange(e.target.value);
                  onDriverChange('');
                  onVehicleChange('');
                }}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="h-3 w-3" aria-hidden />
                Driver
              </label>
              <select
                value={draftDriverId}
                onChange={(e) => onDriverChange(e.target.value)}
                disabled={availLoading}
                className={SELECT_CLASS}
              >
                <option value="">{availLoading ? 'Loading…' : '— No driver —'}</option>
                {availability?.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.firstName} {d.lastName} · {d.employeeCode}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Truck className="h-3 w-3" aria-hidden />
                Vehicle
              </label>
              <select
                value={draftVehicleId}
                onChange={(e) => onVehicleChange(e.target.value)}
                disabled={availLoading}
                className={SELECT_CLASS}
              >
                <option value="">{availLoading ? 'Loading…' : '— No vehicle —'}</option>
                {availability?.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} · {v.vehicleCode} · {v.type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={draftNotes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                placeholder="Internal notes…"
                className={cn(INPUT_CLASS, 'resize-none')}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={onSave} disabled={isUpdating} className="flex-1 gap-1.5">
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-3 w-3" aria-hidden />
                )}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelEdit} disabled={isUpdating}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssignmentField({
  icon,
  label,
  value,
  empty = '—',
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  empty?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-sm', value ? 'text-foreground' : 'text-muted-foreground/50')}>
          {value ?? empty}
        </p>
      </div>
    </div>
  );
}
