'use client';

import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { VehiclesEditSheet } from '@/components/vehicles/vehicles-edit-sheet';
import { VehiclesStatusSheet } from '@/components/vehicles/vehicles-status-sheet';
import { VehiclesAssignDispatchSheet } from '@/components/vehicles/vehicles-assign-dispatch-sheet';
import { VehiclesAssignDriverSheet } from '@/components/vehicles/vehicles-assign-driver-sheet';
import { VehicleGpsBindingPanel } from '@/components/vehicles/vehicle-gps-binding-panel';
import {
  LIVE_DISPATCH,
  assignedDaysCount,
  buildVehicleTimeline,
  formatCapacity,
  isDateExpired,
  isDateExpiring,
  isDispatchLate,
  isOverCapacity,
  makeModelLabel,
  vehicleAvailabilityLabel,
  vehicleInitials,
  vehiclePrimaryBadge,
  vehicleRiskBadges,
  type VehicleOpsBadge,
  type VehicleTimelineItem,
} from '@/components/vehicles/vehicles-ops';
import { useVehicle, useArchiveVehicle, useRestoreVehicle } from '@/lib/api/vehicles';
import { useCurrentUser } from '@/lib/api/auth';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useOrder, useOrdersList } from '@/lib/api/orders';
import { describeError } from '@/lib/api/describe-error';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ADMIN_OPS_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { toast } from 'sonner';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  Package,
  Radio,
  RotateCcw,
  Truck,
  User,
  UserRound,
  XCircle,
} from 'lucide-react';

interface VehiclesDetailProps {
  vehicleId: string;
}

const RAIL_BTN =
  'flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

const TIMELINE_STYLE: Record<
  VehicleTimelineItem['kind'],
  { icon: typeof Clock; className: string }
> = {
  account: { icon: Truck, className: 'bg-muted text-muted-foreground' },
  dispatch: { icon: Truck, className: 'bg-brand/15 text-brand' },
  driver: { icon: User, className: 'bg-brand/10 text-brand' },
  status: { icon: Clock, className: 'bg-muted text-muted-foreground' },
  done: { icon: CheckCircle2, className: 'bg-success/15 text-success' },
  cancel: { icon: XCircle, className: 'bg-destructive/15 text-destructive' },
};

export function VehiclesDetail({ vehicleId }: VehiclesDetailProps) {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const canConnectGps =
    !!currentUser &&
    ADMIN_OPS_ROLES.includes(currentUser.membership.role as MembershipRole);
  const { data: vehicle, loading, error, refetch } = useVehicle(vehicleId);
  const { mutate: archiveVehicle, loading: archiving } = useArchiveVehicle(vehicleId);
  const { mutate: restoreVehicle, loading: restoring } = useRestoreVehicle(vehicleId);

  const dispatchesQuery = useDispatches(1, 50, { vehicleId });
  const dispatches = useMemo(() => dispatchesQuery.data ?? [], [dispatchesQuery.data]);

  const liveDispatch = useMemo(
    () => dispatches.find((d) => LIVE_DISPATCH.includes(d.status)) ?? null,
    [dispatches],
  );

  const ordersQuery = useOrdersList({ vehicleId, limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  const relatedOrders = ordersQuery.data;

  /// Fetched directly rather than derived from relatedOrders — the live
  /// dispatch's order won't be in the 8 most recent for this vehicle if it's
  /// a long-running trip on an older order, and cargo-vs-capacity accuracy
  /// matters more here than avoiding one extra request.
  const liveOrderQuery = useOrder(liveDispatch?.orderId ?? '');
  const liveOrder = liveOrderQuery.data;

  const completed = dispatches.filter((d) => d.status === 'DELIVERED').length;
  const active = dispatches.filter((d) => LIVE_DISPATCH.includes(d.status)).length;
  const lastDispatch = useMemo(() => {
    if (dispatches.length === 0) return null;
    return [...dispatches].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  }, [dispatches]);
  const assignedDays = assignedDaysCount(dispatches);

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assignDispatchOpen, setAssignDispatchOpen] = useState(false);
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const activity = useMemo(
    () => (vehicle ? buildVehicleTimeline(vehicle, dispatches) : []),
    [vehicle, dispatches],
  );

  if (loading) return <LoadingState label="Loading vehicle…" />;
  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate({ to: '/app/vehicles' })} variant="ghost" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Vehicles
        </Button>
        <ErrorState message={error || 'Vehicle not found'} onRetry={() => void refetch()} />
      </div>
    );
  }

  const avail = vehicleAvailabilityLabel(vehicle, liveDispatch);
  const primary = vehiclePrimaryBadge(vehicle, liveDispatch);
  const cargo = liveOrder
    ? { cargoWeightKg: liveOrder.cargoWeightKg, cargoVolumeM3: liveOrder.cargoVolumeM3 }
    : null;
  const risks = vehicleRiskBadges(vehicle, liveDispatch, cargo).filter((b) => b.key !== primary.key);
  const canAssign =
    !vehicle.archivedAt &&
    vehicle.status !== 'MAINTENANCE' &&
    vehicle.status !== 'INACTIVE';
  const busy = archiving || restoring;
  const mm = makeModelLabel(vehicle);
  const driverId = liveDispatch?.driver?.id ?? liveDispatch?.driverId;
  const customerId = liveDispatch?.order?.customer?.id;
  const customerName = liveDispatch?.order?.customer?.companyName;
  const route =
    liveDispatch?.order?.pickupCity && liveDispatch?.order?.deliveryCity
      ? `${liveDispatch.order.pickupCity} → ${liveDispatch.order.deliveryCity}`
      : null;

  const handleArchive = async () => {
    try {
      await archiveVehicle();
      toast.success('Vehicle archived');
      setShowArchive(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive vehicle'));
    }
  };

  const handleRestore = async () => {
    try {
      await restoreVehicle();
      toast.success('Vehicle restored');
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore vehicle'));
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-2 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/vehicles' })}
          className="transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Vehicles
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{vehicle.plateNumber}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm">
        <div className="border-b border-border/60 px-5 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-sm font-bold text-brand">
                {vehicleInitials(vehicle.plateNumber)}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {vehicle.plateNumber}
                  </h1>
                  <OpsChip badge={primary} />
                  {risks.slice(0, 3).map((b) => (
                    <OpsChip key={b.key} badge={b} />
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{vehicle.vehicleCode}</span>
                  <span className="text-muted-foreground">{vehicle.type}</span>
                  {mm && <span className="text-muted-foreground">{mm}</span>}
                  <span className="text-xs text-muted-foreground">
                    {formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <HeaderChip label="Availability" value={avail.label} />
                  <HeaderChip
                    label="Driver"
                    value={
                      liveDispatch?.driver
                        ? `${liveDispatch.driver.firstName} ${liveDispatch.driver.lastName}`
                        : '—'
                    }
                  />
                  <HeaderChip label="Dispatch" value={liveDispatch?.dispatchNumber ?? '—'} />
                  <HeaderChip label="Order" value={liveDispatch?.order?.orderNumber ?? '—'} />
                  {isOverCapacity(vehicle, cargo) && (
                    <HeaderChip label="Capacity" value="Over" tone="warn" />
                  )}
                  {(isDateExpired(vehicle.inspectionExpiry) ||
                    isDateExpiring(vehicle.inspectionExpiry)) && (
                    <HeaderChip
                      label="Inspection"
                      value={isDateExpired(vehicle.inspectionExpiry) ? 'Expired' : 'Due'}
                      tone="warn"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {canAssign && (
                <Button
                  size="sm"
                  className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                  onClick={() => setAssignDispatchOpen(true)}
                >
                  <Truck className="mr-1.5 h-3.5 w-3.5" />
                  Assign Dispatch
                </Button>
              )}
              {canAssign && (
                <Button size="sm" variant="outline" onClick={() => setAssignDriverOpen(true)}>
                  <UserRound className="mr-1.5 h-3.5 w-3.5" />
                  Assign Driver
                </Button>
              )}
              {canConnectGps && !vehicle.archivedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigate({
                      to: '/app/devices',
                      search: { create: true, vehicleId: vehicle.id },
                    })
                  }
                >
                  <Radio className="mr-1.5 h-3.5 w-3.5" />
                  Connect GPS
                </Button>
              ) : null}
              {!vehicle.archivedAt && (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {vehicle.archivedAt ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleRestore()}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Restore
                </Button>
              ) : (
                <ConfirmDialog
                  open={showArchive}
                  onOpenChange={setShowArchive}
                  trigger={
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={busy}
                    >
                      <Archive className="mr-1.5 h-3.5 w-3.5" />
                      Archive
                    </Button>
                  }
                  title="Archive this vehicle?"
                  description="Archived vehicles cannot be assigned. Blocked if they still have a live dispatch."
                  confirmLabel={archiving ? 'Archiving…' : 'Archive'}
                  onConfirm={handleArchive}
                  destructive
                />
              )}
            </div>
          </div>
        </div>

        {/* Mission strip — no GPS / fuel / engine (not on Vehicles API) */}
        <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 sm:grid-cols-5">
          <SummaryStat
            label="Current driver"
            value={
              liveDispatch?.driver
                ? `${liveDispatch.driver.firstName} ${liveDispatch.driver.lastName}`
                : '—'
            }
            hint={liveDispatch?.driver?.employeeCode}
          />
          <SummaryStat
            label="Dispatch"
            value={liveDispatch?.dispatchNumber ?? '—'}
            hint={liveDispatch ? statusLabel(liveDispatch.status) : undefined}
          />
          <SummaryStat
            label="Order"
            value={liveDispatch?.order?.orderNumber ?? '—'}
          />
          <SummaryStat label="Route" value={route ?? '—'} />
          <SummaryStat
            label="Capacity"
            value={formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18%)]">
          <div className="divide-y divide-border/50 lg:border-r lg:border-border/50">
            <section className="p-4 sm:p-5">
              <SectionHeader icon={Truck} title="Current assignment" />
              <div className="mt-3">
                {!liveDispatch ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="No live assignment"
                    description="This vehicle has no active dispatch right now."
                    action={
                      canAssign ? (
                        <Button size="sm" onClick={() => setAssignDispatchOpen(true)}>
                          Assign Dispatch
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-brand/25 bg-gradient-to-br from-brand/8 via-muted/10 to-transparent shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/app/dispatches/$dispatchId"
                            params={{ dispatchId: liveDispatch.id }}
                            className="font-mono text-base font-semibold text-brand hover:underline"
                          >
                            {liveDispatch.dispatchNumber}
                          </Link>
                          <StatusBadge status={liveDispatch.status} />
                          {isDispatchLate(liveDispatch) && (
                            <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                              Late
                            </span>
                          )}
                        </div>
                        {route && (
                          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {liveDispatch.order?.pickupCity}
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            {liveDispatch.order?.deliveryCity}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {driverId && (
                          <Button size="sm" variant="outline" asChild>
                            <Link to="/app/drivers/$driverId" params={{ driverId }}>
                              Open Driver
                            </Link>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to="/app/dispatches/$dispatchId"
                            params={{ dispatchId: liveDispatch.id }}
                          >
                            Open Dispatch
                          </Link>
                        </Button>
                        {liveDispatch.orderId && (
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              to="/app/orders/$orderId"
                              params={{ orderId: liveDispatch.orderId }}
                            >
                              Open Order
                            </Link>
                          </Button>
                        )}
                        {canAssign && (
                          <Button size="sm" onClick={() => setAssignDriverOpen(true)}>
                            Assign Driver
                          </Button>
                        )}
                        {canAssign && (
                          <Button size="sm" variant="secondary" onClick={() => setAssignDispatchOpen(true)}>
                            Assign Dispatch
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-4">
                      <AssignCell
                        label="Driver"
                        value={
                          liveDispatch.driver
                            ? `${liveDispatch.driver.firstName} ${liveDispatch.driver.lastName}`
                            : 'No driver'
                        }
                        tone={!liveDispatch.driver ? 'warn' : undefined}
                      />
                      <AssignCell
                        label="Order"
                        value={liveDispatch.order?.orderNumber ?? '—'}
                        mono
                      />
                      <AssignCell label="Customer" value={customerName ?? '—'} />
                      <AssignCell label="Status" value={statusLabel(liveDispatch.status)} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="p-4 sm:p-5">
              <SectionHeader icon={Truck} title="Vehicle information" />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <InfoTile label="Plate" value={vehicle.plateNumber} mono />
                <InfoTile label="Code" value={vehicle.vehicleCode} mono />
                <InfoTile label="Type" value={vehicle.type} />
                <InfoTile label="Make / model" value={mm ?? '—'} />
                <InfoTile
                  label="Capacity"
                  value={formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
                />
                <InfoTile
                  label="Insurance / registration"
                  value={vehicle.insuranceExpiry ? formatDate(vehicle.insuranceExpiry) : '—'}
                  tone={
                    isDateExpired(vehicle.insuranceExpiry)
                      ? 'bad'
                      : isDateExpiring(vehicle.insuranceExpiry)
                        ? 'warn'
                        : undefined
                  }
                />
                <InfoTile
                  label="Inspection"
                  value={vehicle.inspectionExpiry ? formatDate(vehicle.inspectionExpiry) : '—'}
                  tone={
                    isDateExpired(vehicle.inspectionExpiry)
                      ? 'bad'
                      : isDateExpiring(vehicle.inspectionExpiry)
                        ? 'warn'
                        : undefined
                  }
                />
                <InfoTile label="In fleet since" value={formatDate(vehicle.createdAt)} />
                <InfoTile label="Last updated" value={formatRelativeTime(vehicle.updatedAt)} />
              </div>
            </section>

            {canConnectGps ? (
              <section className="p-4 sm:p-5">
                <SectionHeader icon={Radio} title="Telematics / GPS" />
                <div className="mt-3">
                  <VehicleGpsBindingPanel vehicle={vehicle} />
                </div>
              </section>
            ) : null}

            <section className="p-4 sm:p-5">
              <SectionHeader icon={Clock} title="Timeline" />
              <div className="mt-3">
                {activity.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Clock}
                    title="No timeline yet"
                    description="Events appear as this vehicle is assigned and progresses dispatches."
                  />
                ) : (
                  <ul className="relative space-y-0">
                    {activity.map((item, idx) => {
                      const style = TIMELINE_STYLE[item.kind];
                      const Icon = style.icon;
                      return (
                        <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {idx < activity.length - 1 && (
                            <span
                              className="absolute left-[15px] top-8 bottom-0 w-px bg-border/70"
                              aria-hidden
                            />
                          )}
                          <span
                            className={cn(
                              'relative z-[1] mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                              style.className,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-medium leading-tight">{item.title}</p>
                              <span
                                className="text-[11px] text-muted-foreground"
                                title={formatDateTime(item.at)}
                              >
                                {formatRelativeTime(item.at)}
                              </span>
                            </div>
                            {item.detail && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="p-4 sm:p-5">
              <SectionHeader
                icon={Package}
                title="Orders"
                action={
                  <Link
                    to="/app/orders"
                    search={{}}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    All orders
                  </Link>
                }
              />
              <div className="mt-3">
                {ordersQuery.loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                  </div>
                ) : relatedOrders.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="No orders"
                    description="Orders linked through this vehicle’s dispatches will show here."
                  />
                ) : (
                  <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
                    {relatedOrders.map((order) => (
                      <li key={order.id}>
                        <Link
                          to="/app/orders/$orderId"
                          params={{ orderId: order.id }}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/25 focus-visible:bg-muted/25"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              {order.pickupCity}
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              {order.deliveryCity}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                              {order.orderNumber}
                            </p>
                          </div>
                          <StatusBadge status={order.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="p-4 sm:p-5">
              <SectionHeader
                icon={Truck}
                title="Dispatches"
                action={
                  <Link
                    to="/app/dispatches"
                    search={{}}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    All dispatches
                  </Link>
                }
              />
              <div className="mt-3">
                {dispatchesQuery.loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                  </div>
                ) : dispatches.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Truck}
                    title="No dispatches"
                    description="Assign a dispatch to start this vehicle’s work history."
                    action={
                      canAssign ? (
                        <Button size="sm" variant="outline" onClick={() => setAssignDispatchOpen(true)}>
                          Assign Dispatch
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
                    {dispatches.slice(0, 8).map((d) => (
                      <li key={d.id}>
                        <Link
                          to="/app/dispatches/$dispatchId"
                          params={{ dispatchId: d.id }}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/25 focus-visible:bg-muted/25"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold">{d.dispatchNumber}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {d.order?.pickupCity} → {d.order?.deliveryCity}
                              {d.driver
                                ? ` · ${d.driver.firstName} ${d.driver.lastName}`
                                : ''}
                            </p>
                          </div>
                          <StatusBadge status={d.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="p-4 sm:p-5">
              <SectionHeader icon={CheckCircle2} title="Fleet summary" />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard label="Completed trips" value={String(completed)} tone="good" />
                <MetricCard label="Active dispatches" value={String(active)} tone="brand" />
                {assignedDays != null && (
                  <MetricCard label="Assigned days" value={String(assignedDays)} tone="muted" />
                )}
                <MetricCard label="Availability" value={avail.label} tone="muted" />
                <MetricCard
                  label="Last dispatch"
                  value={lastDispatch?.dispatchNumber ?? '—'}
                  tone="muted"
                  mono
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                From this vehicle’s loaded dispatch history. No telematics or fuel metrics.
              </p>
            </section>
          </div>

          <aside className="bg-muted/10 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-3.5 p-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick actions
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  {canAssign && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => setAssignDriverOpen(true)}
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      Assign Driver
                    </button>
                  )}
                  {canAssign && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => setAssignDispatchOpen(true)}
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Assign Dispatch
                    </button>
                  )}
                  {!vehicle.archivedAt && (
                    <button type="button" className={RAIL_BTN} onClick={() => setEditOpen(true)}>
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                  {!vehicle.archivedAt && (
                    <button type="button" className={RAIL_BTN} onClick={() => setStatusOpen(true)}>
                      <Clock className="h-3.5 w-3.5" />
                      Status
                    </button>
                  )}
                  {!vehicle.archivedAt && (
                    <button
                      type="button"
                      className={cn(RAIL_BTN, 'text-destructive hover:bg-destructive/10')}
                      onClick={() => setShowArchive(true)}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vehicle status
                </h3>
                <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
                  <RailRow label="Availability" value={avail.label} strong />
                  <RailRow
                    label="Driver"
                    value={
                      liveDispatch?.driver
                        ? `${liveDispatch.driver.firstName} ${liveDispatch.driver.lastName}`
                        : '—'
                    }
                  />
                  <RailRow
                    label="Dispatch"
                    value={liveDispatch?.dispatchNumber ?? '—'}
                    mono
                  />
                  <RailRow
                    label="Capacity"
                    value={formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
                  />
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <dt className="text-muted-foreground">Roster</dt>
                    <dd>
                      <StatusBadge status={vehicle.status} />
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Navigation
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  <Link to="/app/drivers" search={{}} className={RAIL_BTN}>
                    <UserRound className="h-3.5 w-3.5" />
                    Drivers
                  </Link>
                  <Link to="/app/dispatches" search={{}} className={RAIL_BTN}>
                    <Truck className="h-3.5 w-3.5" />
                    Dispatches
                  </Link>
                  <Link to="/app/orders" search={{}} className={RAIL_BTN}>
                    <Package className="h-3.5 w-3.5" />
                    Orders
                  </Link>
                  {customerId ? (
                    <Link
                      to="/app/customers/$customerId"
                      params={{ customerId }}
                      className={RAIL_BTN}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Customer
                    </Link>
                  ) : null}
                  {driverId ? (
                    <Link to="/app/drivers/$driverId" params={{ driverId }} className={RAIL_BTN}>
                      <User className="h-3.5 w-3.5" />
                      Current driver
                    </Link>
                  ) : (
                    <span className={cn(RAIL_BTN, 'cursor-default opacity-50')}>
                      <User className="h-3.5 w-3.5" />
                      No driver
                    </span>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {!vehicle.archivedAt && (
        <>
          <VehiclesEditSheet open={editOpen} onOpenChange={setEditOpen} vehicle={vehicle} />
          <VehiclesStatusSheet open={statusOpen} onOpenChange={setStatusOpen} vehicle={vehicle} />
        </>
      )}
      <VehiclesAssignDispatchSheet
        open={assignDispatchOpen}
        onOpenChange={setAssignDispatchOpen}
        vehicle={vehicle}
      />
      <VehiclesAssignDriverSheet
        open={assignDriverOpen}
        onOpenChange={setAssignDriverOpen}
        vehicle={vehicle}
        liveDispatch={liveDispatch}
      />
    </div>
  );
}

function OpsChip({ badge }: { badge: VehicleOpsBadge }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4',
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Truck;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {action}
    </div>
  );
}

function HeaderChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn' | 'bad';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
        tone === 'warn' && 'border-warning/40 bg-warning/10',
        tone === 'bad' && 'border-destructive/40 bg-destructive/10',
        !tone && 'border-border/60 bg-muted/20',
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          tone === 'warn' && 'text-warning',
          tone === 'bad' && 'text-destructive',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </span>
    </span>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AssignCell({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'warn';
}) {
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-sm font-semibold',
          mono && 'font-mono',
          tone === 'warn' ? 'text-warning' : 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InfoTile({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'warn' | 'bad';
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          mono && 'font-mono',
          tone === 'warn' && 'text-warning',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'good' | 'muted';
  mono?: boolean;
}) {
  const toneClass = {
    brand: 'border-brand/25 bg-brand/8',
    good: 'border-success/25 bg-success/8',
    muted: 'border-border/60 bg-muted/25',
  }[tone];
  const valueClass = {
    brand: 'text-brand',
    good: 'text-success',
    muted: 'text-foreground',
  }[tone];
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold tabular-nums', mono && 'font-mono', valueClass)}>
        {value}
      </p>
    </div>
  );
}

function RailRow({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'truncate text-right',
          mono && 'font-mono',
          strong ? 'font-semibold text-foreground' : 'font-medium text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
