'use client';

import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { DriversEditSheet } from '@/components/drivers/drivers-edit-sheet';
import { DriversStatusSheet } from '@/components/drivers/drivers-status-sheet';
import { DriversAssignDispatchSheet } from '@/components/drivers/drivers-assign-dispatch-sheet';
import { DriversAssignVehicleSheet } from '@/components/drivers/drivers-assign-vehicle-sheet';
import {
  LIVE_DISPATCH,
  buildDriverTimeline,
  computableSuccessRate,
  driverAvailabilityLabel,
  driverInitials,
  driverPrimaryBadge,
  driverRiskBadges,
  isLicenseExpired,
  isLicenseExpiring,
  isDispatchLate,
  type DriverOpsBadge,
  type DriverTimelineItem,
} from '@/components/drivers/drivers-ops';
import {
  useDriver,
  useArchiveDriver,
  useRestoreDriver,
  useLinkDriverUser,
  useUnlinkDriverUser,
} from '@/lib/api/drivers';
import { useMembersQuery } from '@/lib/api/organizations';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useOrdersList } from '@/lib/api/orders';
import { describeError } from '@/lib/api/describe-error';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
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
  IdCard,
  Link2,
  Mail,
  Package,
  Phone,
  RotateCcw,
  Truck,
  Unlink,
  User,
  UserRoundCog,
  XCircle,
} from 'lucide-react';

interface DriversDetailProps {
  driverId: string;
}

const RAIL_BTN =
  'flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

const TIMELINE_STYLE: Record<
  DriverTimelineItem['kind'],
  { icon: typeof Clock; className: string }
> = {
  account: { icon: User, className: 'bg-muted text-muted-foreground' },
  dispatch: { icon: Truck, className: 'bg-brand/15 text-brand' },
  vehicle: { icon: Truck, className: 'bg-brand/10 text-brand' },
  status: { icon: Clock, className: 'bg-muted text-muted-foreground' },
  done: { icon: CheckCircle2, className: 'bg-success/15 text-success' },
  cancel: { icon: XCircle, className: 'bg-destructive/15 text-destructive' },
};

export function DriversDetail({ driverId }: DriversDetailProps) {
  const navigate = useNavigate();
  const { data: driver, loading, error, refetch } = useDriver(driverId);
  const { mutate: archiveDriver, loading: archiving } = useArchiveDriver(driverId);
  const { mutate: restoreDriver, loading: restoring } = useRestoreDriver(driverId);
  const { mutate: linkUser, loading: linking } = useLinkDriverUser(driverId);
  const { mutate: unlinkUser, loading: unlinking } = useUnlinkDriverUser(driverId);
  const { data: members = [], isLoading: membersLoading } = useMembersQuery();

  const dispatchesQuery = useDispatches(1, 50, { driverId });
  const dispatches = useMemo(() => dispatchesQuery.data ?? [], [dispatchesQuery.data]);

  const liveDispatch = useMemo(
    () => dispatches.find((d) => LIVE_DISPATCH.includes(d.status)) ?? null,
    [dispatches],
  );

  const ordersQuery = useOrdersList({ driverId, limit: 8, sortBy: 'createdAt', sortOrder: 'desc' });
  const relatedOrders = ordersQuery.data;

  const completed = dispatches.filter((d) => d.status === 'DELIVERED').length;
  const cancelled = dispatches.filter((d) => d.status === 'CANCELLED').length;
  const active = dispatches.filter((d) => LIVE_DISPATCH.includes(d.status)).length;
  const lastDispatch = useMemo(() => {
    if (dispatches.length === 0) return null;
    return [...dispatches].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  }, [dispatches]);
  const successRate = computableSuccessRate(completed, cancelled);

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assignDispatchOpen, setAssignDispatchOpen] = useState(false);
  const [assignVehicleOpen, setAssignVehicleOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const driverLogins = useMemo(
    () =>
      members.filter(
        (m) => m.role === 'DRIVER' && m.status === 'ACTIVE' && Boolean(m.user?.id),
      ),
    [members],
  );

  const activity = useMemo(
    () => (driver ? buildDriverTimeline(driver, dispatches) : []),
    [driver, dispatches],
  );

  if (loading) return <LoadingState label="Loading driver…" />;
  if (error || !driver) {
    return (
      <div className="space-y-4">
        <Button onClick={() => navigate({ to: '/app/drivers' })} variant="ghost" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Drivers
        </Button>
        <ErrorState message={error || 'Driver not found'} onRetry={() => void refetch()} />
      </div>
    );
  }

  const avail = driverAvailabilityLabel(driver, liveDispatch);
  const primary = driverPrimaryBadge(driver, liveDispatch);
  const risks = driverRiskBadges(driver, liveDispatch).filter((b) => b.key !== primary.key);
  const canAssign = !driver.archivedAt && driver.status === 'ACTIVE';
  const linkedMember = driver.userId
    ? members.find((m) => m.user.id === driver.userId)
    : undefined;
  const busy = archiving || restoring || linking || unlinking;
  const vehicleId = liveDispatch?.vehicle?.id ?? liveDispatch?.vehicleId;
  const customerId = liveDispatch?.order?.customer?.id;
  const customerName = liveDispatch?.order?.customer?.companyName;

  const handleArchive = async () => {
    try {
      await archiveDriver();
      toast.success('Driver archived');
      setShowArchive(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive driver'));
    }
  };

  const handleRestore = async () => {
    try {
      await restoreDriver();
      toast.success('Driver restored');
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore driver'));
    }
  };

  const handleLink = async () => {
    if (!selectedUserId) {
      toast.error('Select a DRIVER login');
      return;
    }
    try {
      await linkUser(selectedUserId);
      setSelectedUserId('');
      toast.success('Driver app login linked');
    } catch (err) {
      toast.error(describeError(err, 'Failed to link login'));
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkUser();
      toast.success('Driver app login unlinked');
    } catch (err) {
      toast.error(describeError(err, 'Failed to unlink login'));
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-2 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/drivers' })}
          className="transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Drivers
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{driver.employeeCode}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm">
        {/* Header */}
        <div className="border-b border-border/60 px-5 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-sm font-bold text-brand">
                {driverInitials(driver.firstName, driver.lastName)}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {driver.firstName} {driver.lastName}
                  </h1>
                  <OpsChip badge={primary} />
                  {risks.slice(0, 3).map((b) => (
                    <OpsChip key={b.key} badge={b} />
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{driver.employeeCode}</span>
                  <a
                    href={`tel:${driver.phone}`}
                    className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {driver.phone}
                  </a>
                  {driver.email && (
                    <a
                      href={`mailto:${driver.email}`}
                      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-brand"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {driver.email}
                    </a>
                  )}
                  {driver.licenseNumber && (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <IdCard className="h-3.5 w-3.5" />
                      {driver.licenseNumber}
                      {driver.licenseExpiry ? ` · ${formatDate(driver.licenseExpiry)}` : ''}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <HeaderChip label="Availability" value={avail.label} />
                  <HeaderChip
                    label="Vehicle"
                    value={liveDispatch?.vehicle?.plateNumber ?? '—'}
                  />
                  <HeaderChip
                    label="Dispatch"
                    value={liveDispatch?.dispatchNumber ?? '—'}
                  />
                  <HeaderChip
                    label="Order"
                    value={liveDispatch?.order?.orderNumber ?? '—'}
                  />
                  {isDispatchLate(liveDispatch) && (
                    <HeaderChip label="Risk" value="Late" tone="bad" />
                  )}
                  {(isLicenseExpired(driver.licenseExpiry) ||
                    isLicenseExpiring(driver.licenseExpiry)) && (
                    <HeaderChip
                      label="License"
                      value={isLicenseExpired(driver.licenseExpiry) ? 'Expired' : 'Expiring'}
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
                  <UserRoundCog className="mr-1.5 h-3.5 w-3.5" />
                  Assign Dispatch
                </Button>
              )}
              {canAssign && (
                <Button size="sm" variant="outline" onClick={() => setAssignVehicleOpen(true)}>
                  <Truck className="mr-1.5 h-3.5 w-3.5" />
                  Assign Vehicle
                </Button>
              )}
              {!driver.archivedAt && (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${driver.phone}`}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Call
                </a>
              </Button>
              {driver.archivedAt ? (
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
                  title="Archive this driver?"
                  description="Archived drivers cannot be assigned. Blocked if they still have a live dispatch."
                  confirmLabel={archiving ? 'Archiving…' : 'Archive'}
                  onConfirm={handleArchive}
                  destructive
                />
              )}
            </div>
          </div>
        </div>

        {/* Mission strip — no ETA / location (API does not provide) */}
        <div className="grid grid-cols-2 gap-px border-b border-border/60 bg-border/40 sm:grid-cols-4">
          <SummaryStat
            label="Current assignment"
            value={liveDispatch ? statusLabel(liveDispatch.status) : 'None'}
            hint={liveDispatch?.dispatchNumber}
          />
          <SummaryStat
            label="Vehicle"
            value={liveDispatch?.vehicle?.plateNumber ?? '—'}
            hint={liveDispatch?.vehicle?.type}
          />
          <SummaryStat
            label="Dispatch"
            value={liveDispatch?.dispatchNumber ?? '—'}
            hint={liveDispatch ? statusLabel(liveDispatch.status) : undefined}
          />
          <SummaryStat
            label="Order"
            value={liveDispatch?.order?.orderNumber ?? '—'}
            hint={
              liveDispatch?.order
                ? `${liveDispatch.order.pickupCity} → ${liveDispatch.order.deliveryCity}`
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18%)]">
          <div className="divide-y divide-border/50 lg:border-r lg:border-border/50">
            {/* Current assignment — primary ops card */}
            <section className="p-4 sm:p-5">
              <SectionHeader icon={Truck} title="Current assignment" />
              <div className="mt-3">
                {!liveDispatch ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="No live assignment"
                    description="This driver has no active dispatch right now."
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
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          {liveDispatch.order?.pickupCity ?? '—'}
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          {liveDispatch.order?.deliveryCity ?? '—'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
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
                          <Button size="sm" onClick={() => setAssignVehicleOpen(true)}>
                            Reassign
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-px bg-border/40 sm:grid-cols-2 lg:grid-cols-4">
                      <AssignCell
                        label="Order"
                        value={liveDispatch.order?.orderNumber ?? '—'}
                        mono
                      />
                      <AssignCell
                        label="Customer"
                        value={customerName ?? '—'}
                      />
                      <AssignCell
                        label="Vehicle"
                        value={
                          liveDispatch.vehicle
                            ? `${liveDispatch.vehicle.plateNumber}${liveDispatch.vehicle.type ? ` · ${liveDispatch.vehicle.type}` : ''}`
                            : 'No vehicle'
                        }
                        tone={!liveDispatch.vehicle ? 'warn' : undefined}
                        mono={Boolean(liveDispatch.vehicle)}
                      />
                      <AssignCell
                        label="Status"
                        value={statusLabel(liveDispatch.status)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Driver information */}
            <section className="p-4 sm:p-5">
              <SectionHeader icon={User} title="Driver information" />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <InfoTile label="Phone" value={driver.phone} />
                <InfoTile label="Email" value={driver.email || '—'} />
                <InfoTile label="License" value={driver.licenseNumber || '—'} mono />
                <InfoTile
                  label="License expiry"
                  value={driver.licenseExpiry ? formatDate(driver.licenseExpiry) : '—'}
                  tone={
                    isLicenseExpired(driver.licenseExpiry)
                      ? 'bad'
                      : isLicenseExpiring(driver.licenseExpiry)
                        ? 'warn'
                        : undefined
                  }
                />
                <InfoTile label="Roster since" value={formatDate(driver.createdAt)} />
                <InfoTile label="Last updated" value={formatRelativeTime(driver.updatedAt)} />
              </div>
            </section>

            {/* Timeline */}
            <section className="p-4 sm:p-5">
              <SectionHeader icon={Clock} title="Timeline" />
              <div className="mt-3">
                {activity.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Clock}
                    title="No timeline yet"
                    description="Events appear as this driver is assigned and progresses dispatches."
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

            {/* Orders */}
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
                    description="Orders linked through this driver’s dispatches will show here."
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

            {/* Dispatches */}
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
                    description="Assign a dispatch to start this driver’s work history."
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
                              {d.vehicle?.plateNumber ? ` · ${d.vehicle.plateNumber}` : ''}
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

            {/* Performance — computable from loaded dispatches only */}
            <section className="p-4 sm:p-5">
              <SectionHeader icon={CheckCircle2} title="Performance" />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard label="Completed" value={String(completed)} tone="good" />
                <MetricCard label="Cancelled" value={String(cancelled)} tone="muted" />
                <MetricCard label="Active" value={String(active)} tone="brand" />
                <MetricCard
                  label="Last dispatch"
                  value={lastDispatch?.dispatchNumber ?? '—'}
                  tone="muted"
                  mono
                />
                {successRate != null && (
                  <MetricCard label="Success rate" value={`${successRate}%`} tone="good" />
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                From this driver’s loaded dispatch history
                {successRate != null ? ' · success = completed ÷ (completed + cancelled)' : ''}.
              </p>
            </section>

            {/* Driver app access */}
            {!driver.archivedAt && (
              <section className="p-4 sm:p-5">
                <SectionHeader icon={Link2} title="Driver app access" />
                <div className="mt-3 space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4">
                  <p className="text-xs text-muted-foreground">
                    Link an active DRIVER-role login so they can open My Deliveries.
                  </p>
                  {driver.userId ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {linkedMember
                            ? `${linkedMember.user.firstName} ${linkedMember.user.lastName}`
                            : 'Login linked'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {linkedMember?.user.email ?? driver.userId}
                        </p>
                      </div>
                      <ConfirmDialog
                        trigger={
                          <Button variant="outline" size="sm" className="gap-2" disabled={busy}>
                            <Unlink className="h-3.5 w-3.5" />
                            Unlink
                          </Button>
                        }
                        title="Unlink driver app login?"
                        description="They lose My Deliveries until linked again."
                        confirmLabel="Unlink"
                        onConfirm={() => void handleUnlink()}
                        destructive
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="linkUserId" className="text-xs text-muted-foreground">
                        DRIVER login
                      </Label>
                      <select
                        id="linkUserId"
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        disabled={busy || membersLoading}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">
                          {membersLoading ? 'Loading…' : 'Select a DRIVER member…'}
                        </option>
                        {driverLogins.map((m) => (
                          <option key={m.user.id} value={m.user.id}>
                            {m.user.firstName} {m.user.lastName} — {m.user.email}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => void handleLink()}
                        disabled={busy || !selectedUserId}
                        className="gap-2"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Link login
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Sticky rail */}
          <aside className="bg-muted/10 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-3.5 p-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick actions
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  <a href={`tel:${driver.phone}`} className={RAIL_BTN}>
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                  {canAssign && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => setAssignDispatchOpen(true)}
                    >
                      <UserRoundCog className="h-3.5 w-3.5" />
                      Assign Dispatch
                    </button>
                  )}
                  {canAssign && (
                    <button
                      type="button"
                      className={RAIL_BTN}
                      onClick={() => setAssignVehicleOpen(true)}
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Assign Vehicle
                    </button>
                  )}
                  {!driver.archivedAt && (
                    <button type="button" className={RAIL_BTN} onClick={() => setEditOpen(true)}>
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                  {!driver.archivedAt && (
                    <button type="button" className={RAIL_BTN} onClick={() => setStatusOpen(true)}>
                      <Clock className="h-3.5 w-3.5" />
                      Change Status
                    </button>
                  )}
                  {!driver.archivedAt && (
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
                  Driver status
                </h3>
                <dl className="space-y-2 rounded-lg border border-border/60 bg-surface px-3 py-2.5 text-xs">
                  <RailRow label="Availability" value={avail.label} strong />
                  <RailRow
                    label="Current dispatch"
                    value={liveDispatch?.dispatchNumber ?? '—'}
                    mono
                  />
                  <RailRow
                    label="Current vehicle"
                    value={liveDispatch?.vehicle?.plateNumber ?? '—'}
                    mono
                  />
                  <RailRow label="License" value={driver.licenseNumber ?? '—'} mono />
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <dt className="text-muted-foreground">Roster</dt>
                    <dd>
                      <StatusBadge status={driver.status} />
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Navigation
                </h3>
                <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-surface">
                  <Link to="/app/orders" search={{}} className={RAIL_BTN}>
                    <Package className="h-3.5 w-3.5" />
                    Orders
                  </Link>
                  <Link to="/app/dispatches" search={{}} className={RAIL_BTN}>
                    <Truck className="h-3.5 w-3.5" />
                    Dispatches
                  </Link>
                  {vehicleId ? (
                    <Link
                      to="/app/vehicles/$vehicleId"
                      params={{ vehicleId }}
                      className={RAIL_BTN}
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Vehicle
                    </Link>
                  ) : (
                    <span className={cn(RAIL_BTN, 'cursor-default opacity-50')}>
                      <Truck className="h-3.5 w-3.5" />
                      No vehicle
                    </span>
                  )}
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
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {!driver.archivedAt && (
        <>
          <DriversEditSheet open={editOpen} onOpenChange={setEditOpen} driver={driver} />
          <DriversStatusSheet open={statusOpen} onOpenChange={setStatusOpen} driver={driver} />
        </>
      )}
      <DriversAssignDispatchSheet
        open={assignDispatchOpen}
        onOpenChange={setAssignDispatchOpen}
        driver={driver}
      />
      <DriversAssignVehicleSheet
        open={assignVehicleOpen}
        onOpenChange={setAssignVehicleOpen}
        driver={driver}
        liveDispatch={liveDispatch}
      />
    </div>
  );
}

function OpsChip({ badge }: { badge: DriverOpsBadge }) {
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
  icon: typeof User;
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
      <p className="mt-1 truncate font-mono text-base font-semibold tracking-tight text-foreground sm:text-lg">
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
