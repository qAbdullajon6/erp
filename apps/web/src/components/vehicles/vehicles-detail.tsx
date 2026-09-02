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
  Copy,
  Edit2,
  Package,
  Radio,
  RotateCcw,
  Shield,
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

  // Formatted subtitle: "VEH-0002 · Isuzu NPR 82 2023 · Box Truck · 5000 kg · 24 m³"
  const subtitleParts = [
    vehicle.vehicleCode,
    mm,
    vehicle.type,
    formatCapacity(vehicle.capacityKg, vehicle.capacityM3),
  ].filter(Boolean);

  // Document expiry states for sidebar
  const insExpired = isDateExpired(vehicle.insuranceExpiry);
  const insExpiring = !insExpired && isDateExpiring(vehicle.insuranceExpiry);
  const inspExpired = isDateExpired(vehicle.inspectionExpiry);
  const inspExpiring = !inspExpired && isDateExpiring(vehicle.inspectionExpiry);

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
      {/* Back nav */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/vehicles' })}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Vehicles
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{vehicle.plateNumber}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm">

        {/* ─── Header ─── */}
        <div className="border-b border-border/60 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">

            {/* Identity */}
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {/* Vehicle image */}
              <div className="relative h-[80px] w-[110px] shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                <img
                  src="/isuzi.png"
                  alt={vehicle.plateNumber}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    padding: '8px',
                  }}
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                {/* Plate + badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {vehicle.plateNumber}
                  </h1>
                  <OpsChip badge={primary} />
                  {risks.slice(0, 4).map((b) => (
                    <OpsChip key={b.key} badge={b} />
                  ))}
                </div>

                {/* Subtitle */}
                <p className="text-sm text-muted-foreground">
                  {subtitleParts.join(' · ')}
                </p>

                {/* VIN */}
                {vehicle.vin && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>VIN: {vehicle.vin}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(vehicle.vin!);
                        toast.success('VIN copied');
                      }}
                      className="transition-colors hover:text-foreground"
                      aria-label="Copy VIN"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
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

        {/* ─── Summary strip ─── */}
        <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 sm:grid-cols-5">
          <SummaryStat
            label="Current Driver"
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
          <SummaryStat label="Order" value={liveDispatch?.order?.orderNumber ?? '—'} />
          <SummaryStat label="Route" value={route ?? '—'} />
          <SummaryStat
            label="Capacity"
            value={formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
          />
        </div>

        {/* ─── Main two-column layout ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22%)]">

          {/* Left column */}
          <div className="divide-y divide-border/50 lg:border-r lg:border-border/50">

            {/* Current Assignment */}
            <section className="p-5">
              <SectionHeader icon={Truck} title="Current Assignment" />
              <div className="mt-4">
                {!liveDispatch ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="No live assignment"
                    description="This vehicle has no active dispatch right now."
                    action={
                      canAssign ? (
                        <Button
                          size="sm"
                          className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                          onClick={() => setAssignDispatchOpen(true)}
                        >
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
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setAssignDispatchOpen(true)}
                          >
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
                      <AssignCell label="Order" value={liveDispatch.order?.orderNumber ?? '—'} mono />
                      <AssignCell label="Customer" value={customerName ?? '—'} />
                      <AssignCell label="Status" value={statusLabel(liveDispatch.status)} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Vehicle Information */}
            <section className="p-5">
              <SectionHeader icon={Truck} title="Vehicle Information" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <InfoTile label="Plate" value={vehicle.plateNumber} mono />
                <InfoTile label="Code" value={vehicle.vehicleCode} mono />
                <InfoTile label="Type" value={vehicle.type} />
                <InfoTile label="Make / Model" value={mm ?? '—'} />
                <InfoTile
                  label="Capacity"
                  value={formatCapacity(vehicle.capacityKg, vehicle.capacityM3)}
                />
                <InfoTile label="Fuel Type" value={vehicle.fuelType ?? '—'} />
                {vehicle.vin ? (
                  <InfoTile label="VIN" value={vehicle.vin} mono />
                ) : null}
                <InfoTile
                  label="Insurance / Registration"
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
                <InfoTile label="In Fleet Since" value={formatDate(vehicle.createdAt)} />
                <InfoTile label="Last Updated" value={formatRelativeTime(vehicle.updatedAt)} />
                <InfoTile label="Notes" value={vehicle.notes ?? '—'} />
              </div>
            </section>

            {/* Telematics / GPS */}
            {canConnectGps ? (
              <section className="p-5">
                <SectionHeader icon={Radio} title="Telematics / GPS" />
                <div className="mt-4">
                  <VehicleGpsBindingPanel vehicle={vehicle} />
                </div>
              </section>
            ) : null}

            {/* Timeline + Orders + Dispatches — 3-column grid */}
            <section className="p-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">

                {/* Timeline */}
                <div className="flex flex-col gap-3">
                  <SectionHeader icon={Clock} title="Timeline" />
                  {activity.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Clock}
                      title="No timeline yet"
                      description="Events appear as this vehicle is assigned and progresses dispatches."
                    />
                  ) : (
                    <ul className="relative space-y-0">
                      {activity.slice(0, 6).map((item, idx) => {
                        const style = TIMELINE_STYLE[item.kind];
                        const Icon = style.icon;
                        return (
                          <li key={item.id} className="relative flex gap-3 pb-3 last:pb-0">
                            {idx < Math.min(activity.length, 6) - 1 && (
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
                  {activity.length > 6 && (
                    <p className="text-[11px] font-medium text-brand hover:underline cursor-default">
                      View full timeline →
                    </p>
                  )}
                </div>

                {/* Orders */}
                <div className="flex flex-col gap-3">
                  <SectionHeader
                    icon={Package}
                    title="Orders"
                    action={
                      <Link
                        to="/app/orders"
                        search={{}}
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        All orders →
                      </Link>
                    }
                  />
                  {ordersQuery.loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full rounded-lg" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ) : relatedOrders.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Package}
                      title="No orders"
                      description="Orders linked through this vehicle's dispatches will show here."
                    />
                  ) : (
                    <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
                      {relatedOrders.slice(0, 4).map((order) => (
                        <li key={order.id}>
                          <Link
                            to="/app/orders/$orderId"
                            params={{ orderId: order.id }}
                            className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-muted/25"
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-1 text-xs font-medium">
                                {order.pickupCity}
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                {order.deliveryCity}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
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

                {/* Dispatches */}
                <div className="flex flex-col gap-3">
                  <SectionHeader
                    icon={Truck}
                    title="Dispatches"
                    action={
                      <Link
                        to="/app/dispatches"
                        search={{}}
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        All dispatches →
                      </Link>
                    }
                  />
                  {dispatchesQuery.loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full rounded-lg" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ) : dispatches.length === 0 ? (
                    <EmptyState
                      compact
                      icon={Truck}
                      title="No dispatches"
                      description="Assign a dispatch to start this vehicle's work history."
                      action={
                        canAssign ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAssignDispatchOpen(true)}
                          >
                            Assign Dispatch
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
                      {dispatches.slice(0, 4).map((d) => (
                        <li key={d.id}>
                          <Link
                            to="/app/dispatches/$dispatchId"
                            params={{ dispatchId: d.id }}
                            className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-muted/25"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold">{d.dispatchNumber}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {d.order?.pickupCity} → {d.order?.deliveryCity}
                                {d.driver ? ` · ${d.driver.firstName} ${d.driver.lastName}` : ''}
                              </p>
                            </div>
                            <StatusBadge status={d.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* Fleet Summary */}
            <section className="p-5">
              <SectionHeader icon={CheckCircle2} title="Fleet Summary" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricCard label="Completed Trips" value={String(completed)} tone="good" />
                <MetricCard label="Active Dispatches" value={String(active)} tone="brand" />
                <MetricCard label="Availability" value={avail.label} tone="muted" />
                <MetricCard
                  label="Last Dispatch"
                  value={lastDispatch?.dispatchNumber ?? '—'}
                  tone="muted"
                  mono
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                From this vehicle's loaded dispatch history. No telematics or fuel metrics.
              </p>
            </section>
          </div>

          {/* ─── Right sidebar ─── */}
          <aside className="bg-muted/10 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-4 p-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">

              {/* Quick Actions */}
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick Actions
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  {canAssign && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => setAssignDriverOpen(true)}
                    >
                      <UserRound className="h-3.5 w-3.5 shrink-0" />
                      Assign Driver
                    </button>
                  )}
                  {canAssign && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => setAssignDispatchOpen(true)}
                    >
                      <Truck className="h-3.5 w-3.5 shrink-0" />
                      Assign Dispatch
                    </button>
                  )}
                  {!vehicle.archivedAt && (
                    <button type="button" className={RAIL_BTN} onClick={() => setEditOpen(true)}>
                      <Edit2 className="h-3.5 w-3.5 shrink-0" />
                      Edit Vehicle
                    </button>
                  )}
                  {!vehicle.archivedAt && (
                    <button type="button" className={RAIL_BTN} onClick={() => setStatusOpen(true)}>
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      Update Status
                    </button>
                  )}
                  {!vehicle.archivedAt && (
                    <button
                      type="button"
                      className={cn(RAIL_BTN, 'text-destructive hover:bg-destructive/10')}
                      onClick={() => setShowArchive(true)}
                    >
                      <Archive className="h-3.5 w-3.5 shrink-0" />
                      Archive Vehicle
                    </button>
                  )}
                </div>
              </div>

              {/* Vehicle Status */}
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vehicle Status
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
                  <RailRow label="Dispatch" value={liveDispatch?.dispatchNumber ?? '—'} mono />
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

              {/* Documents */}
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Documents
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Insurance / Registration
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          insExpired
                            ? 'text-destructive'
                            : insExpiring
                              ? 'text-amber-500'
                              : 'text-foreground',
                        )}
                      >
                        {vehicle.insuranceExpiry ? formatDate(vehicle.insuranceExpiry) : '—'}
                      </span>
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          insExpired
                            ? 'bg-destructive'
                            : insExpiring
                              ? 'bg-amber-500'
                              : vehicle.insuranceExpiry
                                ? 'bg-emerald-500'
                                : 'bg-muted-foreground/30',
                        )}
                      />
                    </div>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground">Inspection</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          inspExpired
                            ? 'text-destructive'
                            : inspExpiring
                              ? 'text-amber-500'
                              : 'text-foreground',
                        )}
                      >
                        {vehicle.inspectionExpiry ? formatDate(vehicle.inspectionExpiry) : '—'}
                      </span>
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          inspExpired
                            ? 'bg-destructive'
                            : inspExpiring
                              ? 'bg-amber-500'
                              : vehicle.inspectionExpiry
                                ? 'bg-emerald-500'
                                : 'bg-muted-foreground/30',
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Navigation
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  <Link to="/app/drivers" search={{}} className={RAIL_BTN}>
                    <UserRound className="h-3.5 w-3.5 shrink-0" />
                    Drivers
                  </Link>
                  <Link to="/app/dispatches" search={{}} className={RAIL_BTN}>
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    Dispatches
                  </Link>
                  <Link to="/app/orders" search={{}} className={RAIL_BTN}>
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    Orders
                  </Link>
                  {customerId ? (
                    <Link
                      to="/app/customers/$customerId"
                      params={{ customerId }}
                      className={RAIL_BTN}
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      Customer
                    </Link>
                  ) : null}
                  {driverId ? (
                    <Link to="/app/drivers/$driverId" params={{ driverId }} className={RAIL_BTN}>
                      <User className="h-3.5 w-3.5 shrink-0" />
                      Current Driver
                    </Link>
                  ) : (
                    <span className={cn(RAIL_BTN, 'cursor-default opacity-50')}>
                      <User className="h-3.5 w-3.5 shrink-0" />
                      No driver assigned
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold tabular-nums',
          mono && 'font-mono',
          valueClass,
        )}
      >
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
