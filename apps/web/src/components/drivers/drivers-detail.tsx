'use client';

import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { DriverAvatar } from '@/components/drivers/driver-avatar';
import { DriverDocumentsSection } from '@/components/drivers/driver-documents-section';
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
import type { ApiDispatch } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  ExternalLink,
  FileText,
  HeartPulse,
  History,
  IdCard,
  Link2,
  Mail,
  MoreHorizontal,
  Package,
  Phone,
  RotateCcw,
  Route,
  Truck,
  Unlink,
  User,
  UserRoundCog,
  XCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriversDetailProps { driverId: string }
type TripsTab = 'active' | 'upcoming' | 'completed';

const TIMELINE_STYLE: Record<DriverTimelineItem['kind'], { icon: typeof Clock; dot: string }> = {
  account: { icon: User, dot: 'bg-muted text-muted-foreground' },
  dispatch: { icon: Truck, dot: 'bg-brand/20 text-brand' },
  vehicle: { icon: Truck, dot: 'bg-sky-500/20 text-sky-400' },
  status: { icon: Clock, dot: 'bg-muted text-muted-foreground' },
  done: { icon: CheckCircle2, dot: 'bg-success/20 text-success' },
  cancel: { icon: XCircle, dot: 'bg-destructive/20 text-destructive' },
};

// ─── Progress stage helper ────────────────────────────────────────────────────

type StageState = 'done' | 'active' | 'pending';

function getDispatchStages(status: string): [StageState, StageState, StageState] {
  switch (status) {
    case 'ASSIGNED': return ['active', 'pending', 'pending'];
    case 'EN_ROUTE_TO_PICKUP': return ['active', 'pending', 'pending'];
    case 'AT_PICKUP': return ['active', 'pending', 'pending'];
    case 'IN_TRANSIT': return ['done', 'active', 'pending'];
    case 'DELIVERED': return ['done', 'done', 'done'];
    default: return ['pending', 'pending', 'pending'];
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  const ordersQuery = useOrdersList({ driverId, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
  const relatedOrders = ordersQuery.data;

  const completed = dispatches.filter((d) => d.status === 'DELIVERED').length;
  const cancelled = dispatches.filter((d) => d.status === 'CANCELLED').length;
  const active = dispatches.filter((d) => LIVE_DISPATCH.includes(d.status)).length;
  const successRate = computableSuccessRate(completed, cancelled);

  // Trips tabs
  const [tripsTab, setTripsTab] = useState<TripsTab>('active');
  const tripRows = useMemo(() => {
    if (tripsTab === 'active') return dispatches.filter((d) => ['IN_TRANSIT', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP'].includes(d.status));
    if (tripsTab === 'upcoming') return dispatches.filter((d) => d.status === 'ASSIGNED');
    return dispatches.filter((d) => d.status === 'DELIVERED' || d.status === 'CANCELLED');
  }, [dispatches, tripsTab]);

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assignDispatchOpen, setAssignDispatchOpen] = useState(false);
  const [assignVehicleOpen, setAssignVehicleOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const driverLogins = useMemo(
    () => members.filter((m) => m.role === 'DRIVER' && m.status === 'ACTIVE' && Boolean(m.user?.id)),
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

  const primary = driverPrimaryBadge(driver, liveDispatch);
  const risks = driverRiskBadges(driver, liveDispatch).filter((b) => b.key !== primary.key);
  const canAssign = !driver.archivedAt && driver.status === 'ACTIVE';
  const linkedMember = driver.userId ? members.find((m) => m.user.id === driver.userId) : undefined;
  const busy = archiving || restoring || linking || unlinking;
  const vehicleId = liveDispatch?.vehicle?.id ?? liveDispatch?.vehicleId;
  const customerId = liveDispatch?.order?.customer?.id;

  const handleArchive = async () => {
    try { await archiveDriver(); toast.success('Driver archived'); setShowArchive(false); }
    catch (err) { toast.error(describeError(err, 'Failed to archive driver')); }
  };

  const handleRestore = async () => {
    try { await restoreDriver(); toast.success('Driver restored'); }
    catch (err) { toast.error(describeError(err, 'Failed to restore driver')); }
  };

  const handleLink = async () => {
    if (!selectedUserId) { toast.error('Select a DRIVER login'); return; }
    try { await linkUser(selectedUserId); setSelectedUserId(''); toast.success('Driver app login linked'); }
    catch (err) { toast.error(describeError(err, 'Failed to link login')); }
  };

  const handleUnlink = async () => {
    try { await unlinkUser(); toast.success('Driver app login unlinked'); }
    catch (err) { toast.error(describeError(err, 'Failed to unlink login')); }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Avatar dot color
  const avatarDot = driver.archivedAt
    ? 'bg-muted-foreground'
    : driver.status === 'ACTIVE' && !liveDispatch
      ? 'bg-success'
      : driver.status === 'ACTIVE'
        ? 'bg-brand'
        : driver.status === 'ON_LEAVE'
          ? 'bg-warning'
          : 'bg-muted-foreground';

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pb-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/drivers' })}
          className="transition-colors hover:text-foreground"
        >
          Drivers
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono font-medium text-foreground">{driver.employeeCode}</span>
      </nav>

      {/* Header Card */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-start gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <DriverAvatar driver={driver} size="lg" />
              <span className={cn('absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-surface', avatarDot)} />
            </div>

            {/* Identity */}
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {driver.firstName} {driver.lastName}
                </h1>
                <OpsChip badge={primary} />
                {risks.slice(0, 2).map((b) => <OpsChip key={b.key} badge={b} />)}
                {isDispatchLate(liveDispatch) && (
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    Late
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{driver.employeeCode}</span>
                <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1.5 text-foreground/80 hover:text-brand">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {driver.phone}
                </a>
                {driver.email && (
                  <a href={`mailto:${driver.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {driver.email}
                  </a>
                )}
              </div>

              {/* License row */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                {driver.licenseNumber && (
                  <span className="inline-flex items-center gap-1.5">
                    <IdCard className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground/70">License</span>
                    <span className="font-mono font-medium text-foreground/80">{driver.licenseNumber}</span>
                  </span>
                )}
                {driver.licenseExpiry && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span className="text-muted-foreground/70">Expires</span>
                    <span className={cn(
                      'font-medium',
                      isLicenseExpired(driver.licenseExpiry) ? 'text-destructive' :
                      isLicenseExpiring(driver.licenseExpiry) ? 'text-warning' : 'text-foreground/80',
                    )}>
                      {formatDate(driver.licenseExpiry)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            {!driver.archivedAt && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <a href={`tel:${driver.phone}`}>
                    <Phone className="mr-2 h-3.5 w-3.5" />
                    Call driver
                  </a>
                </DropdownMenuItem>
                {driver.email && (
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${driver.email}`}>
                      <Mail className="mr-2 h-3.5 w-3.5" />
                      Send message
                    </a>
                  </DropdownMenuItem>
                )}
                {canAssign && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setAssignDispatchOpen(true)}>
                      <UserRoundCog className="mr-2 h-3.5 w-3.5" />
                      Assign dispatch
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAssignVehicleOpen(true)}>
                      <Truck className="mr-2 h-3.5 w-3.5" />
                      Assign vehicle
                    </DropdownMenuItem>
                  </>
                )}
                {!driver.archivedAt && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusOpen(true)}>
                      <Clock className="mr-2 h-3.5 w-3.5" />
                      Change status
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                {driver.archivedAt ? (
                  <DropdownMenuItem onClick={() => void handleRestore()} disabled={busy}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Restore driver
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowArchive(true)}
                    disabled={busy}
                  >
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    Archive driver
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_268px] lg:items-start lg:gap-5">

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Current Assignment */}
          <section id="section-assignment">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={Truck} title="Current Assignment" className="border-b border-border/50 px-5 py-3" />

              {!liveDispatch ? (
                <div className="px-5 py-4">
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
                </div>
              ) : (
                <>
                  {/* 3-column assignment grid */}
                  <div className="grid grid-cols-1 divide-y divide-border/40 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {/* Vehicle */}
                    <div className="px-5 py-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</p>
                      {liveDispatch.vehicle ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                              <Truck className="h-4 w-4" />
                            </span>
                            {vehicleId ? (
                              <Link
                                to="/app/vehicles/$vehicleId"
                                params={{ vehicleId }}
                                className="text-base font-bold text-foreground hover:text-brand"
                              >
                                {liveDispatch.vehicle.type?.replace(/_/g, ' ') ?? liveDispatch.vehicle.plateNumber}
                              </Link>
                            ) : (
                              <p className="text-base font-bold text-foreground">
                                {liveDispatch.vehicle.type?.replace(/_/g, ' ') ?? liveDispatch.vehicle.plateNumber}
                              </p>
                            )}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">{liveDispatch.vehicle.plateNumber}</p>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              ['IN_TRANSIT', 'EN_ROUTE_TO_PICKUP'].includes(liveDispatch.status) ? 'bg-success' : 'bg-warning',
                            )} />
                            <span className="text-xs text-muted-foreground">
                              {liveDispatch.status === 'IN_TRANSIT' ? 'On the road' :
                               liveDispatch.status === 'AT_PICKUP' ? 'At pickup' :
                               liveDispatch.status === 'EN_ROUTE_TO_PICKUP' ? 'En route' : 'Awaiting'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/60 italic">No vehicle assigned</p>
                      )}
                    </div>

                    {/* Order */}
                    <div className="px-5 py-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Order</p>
                      {liveDispatch.order ? (
                        <div className="space-y-1">
                          {liveDispatch.orderId ? (
                            <Link
                              to="/app/orders/$orderId"
                              params={{ orderId: liveDispatch.orderId }}
                              className="flex items-center gap-1.5 font-mono text-base font-bold text-brand hover:underline"
                            >
                              {liveDispatch.order.orderNumber}
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                            </Link>
                          ) : (
                            <p className="font-mono text-base font-bold text-brand">{liveDispatch.order.orderNumber}</p>
                          )}
                          <p className="flex items-center gap-1 text-sm text-foreground/80">
                            <span className="max-w-[80px] truncate">{liveDispatch.order.pickupCity}</span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="max-w-[80px] truncate">{liveDispatch.order.deliveryCity}</span>
                          </p>
                          <div className="pt-0.5">
                            <StatusBadge status={liveDispatch.status} />
                          </div>
                        </div>
                      ) : (
                        <p className="font-mono text-base font-bold text-brand">{liveDispatch.dispatchNumber}</p>
                      )}
                    </div>

                    {/* ETA */}
                    <div className="px-5 py-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ETA</p>
                      <p className="text-base font-bold text-foreground">
                        {formatDate(liveDispatch.deliveryDateScheduled)}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {new Date(liveDispatch.deliveryDateScheduled).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ({formatRelativeTime(liveDispatch.deliveryDateScheduled)})
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="border-t border-border/40 px-5 pb-4 pt-3">
                    <DispatchProgressBar live={liveDispatch} />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Dispatch Summary */}
          <section>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total Dispatches', value: String(dispatches.length), sub: `${active} active`, icon: Truck, color: 'text-brand' },
                { label: 'Completed', value: String(completed), sub: 'DELIVERED', icon: CheckCircle2, color: 'text-success' },
                { label: 'Cancelled', value: String(cancelled), sub: 'CANCELLED', icon: XCircle, color: 'text-muted-foreground' },
                { label: 'Success Rate', value: successRate != null ? `${successRate}%` : '—', sub: 'completed ÷ (completed+cancelled)', icon: BadgeCheck, color: successRate != null && successRate >= 80 ? 'text-success' : 'text-warning' },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.label} className="rounded-xl border border-border/60 bg-surface px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</span>
                      <Icon className={cn('h-3.5 w-3.5', m.color)} />
                    </div>
                    <p className={cn('mt-2 text-2xl font-bold tabular-nums', m.color)}>{m.value}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{m.sub}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Orders & Trips */}
          <section id="section-trips">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              {/* Tab header */}
              <div className="flex items-center justify-between border-b border-border/50 px-5 pt-3">
                <div className="flex gap-0">
                  {([
                    { key: 'active', label: 'Active', count: dispatches.filter((d) => ['IN_TRANSIT', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP'].includes(d.status)).length },
                    { key: 'upcoming', label: 'Upcoming', count: dispatches.filter((d) => d.status === 'ASSIGNED').length },
                    { key: 'completed', label: 'Completed', count: dispatches.filter((d) => ['DELIVERED', 'CANCELLED'].includes(d.status)).length },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTripsTab(t.key as TripsTab)}
                      className={cn(
                        'flex items-center gap-1.5 border-b-2 px-4 pb-2.5 pt-1 text-sm font-medium transition-colors',
                        tripsTab === t.key
                          ? 'border-brand text-brand'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t.label}
                      <span className={cn(
                        'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                        tripsTab === t.key ? 'bg-brand/20 text-brand' : 'bg-muted text-muted-foreground',
                      )}>
                        {t.count}
                      </span>
                    </button>
                  ))}
                </div>
                <Link to="/app/dispatches" search={{}} className="mb-2 text-[11px] font-medium text-brand hover:underline">
                  All dispatches
                </Link>
              </div>

              {/* Trips table */}
              {dispatchesQuery.loading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : tripRows.length === 0 ? (
                <div className="px-5 py-6">
                  <EmptyState compact icon={Truck} title="No trips" description={`No ${tripsTab} dispatches.`} />
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/[0.04]">
                      <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Order</th>
                      <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Route</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Pickup</th>
                      <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground xl:table-cell">Delivery</th>
                      <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {tripRows.map((d) => (
                      <tr key={d.id} className="group hover:bg-muted/10">
                        <td className="px-4 py-3">
                          <Link
                            to="/app/dispatches/$dispatchId"
                            params={{ dispatchId: d.id }}
                            className="block"
                          >
                            <p className="font-mono text-sm font-semibold text-brand hover:underline">{d.dispatchNumber}</p>
                            {d.order?.orderNumber && (
                              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{d.order.orderNumber}</p>
                            )}
                          </Link>
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          {d.order ? (
                            <div>
                              <p className="flex items-center gap-1 text-sm text-foreground/80">
                                <span className="max-w-[60px] truncate">{d.order.pickupCity}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="max-w-[60px] truncate">{d.order.deliveryCity}</span>
                              </p>
                                    </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          <p className="text-xs text-foreground/80">{formatDate(d.pickupDateScheduled)}</p>
                          {d.pickupDateActual && (
                            <p className="mt-0.5 text-[10px] text-success">Actual: {formatDate(d.pickupDateActual)}</p>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 xl:table-cell">
                          <p className="text-xs text-foreground/80">{formatDate(d.deliveryDateScheduled)}</p>
                          {d.deliveryDateActual && (
                            <p className="mt-0.5 text-[10px] text-success">Actual: {formatDate(d.deliveryDateActual)}</p>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          {!['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(d.status) ? (
                            <div>
                              <p className="text-xs text-foreground/80">{formatDate(d.deliveryDateScheduled)}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{formatRelativeTime(d.deliveryDateScheduled)}</p>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* 3-column lower section */}
          <div id="section-lower" className="grid grid-cols-1 gap-4 md:grid-cols-3">

            {/* Vehicle Information */}
            <section id="section-vehicle" className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={Truck} title="Vehicle Information" className="border-b border-border/50 px-4 py-3" />
              <div className="px-4 py-4">
                {liveDispatch?.vehicle ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand">
                        <Truck className="h-5 w-5" />
                      </span>
                      <p className="text-base font-bold text-foreground">
                        {liveDispatch.vehicle.type?.replace(/_/g, ' ') ?? liveDispatch.vehicle.plateNumber}
                      </p>
                    </div>
                    <dl className="space-y-2 text-xs">
                      <InfoRow label="Plate number" value={liveDispatch.vehicle.plateNumber} mono />
                      <InfoRow label="Type" value={liveDispatch.vehicle.type?.replace(/_/g, ' ') ?? '—'} />
                      <InfoRow
                        label="Status"
                        value={liveDispatch.status === 'IN_TRANSIT' ? 'On the road' : 'Active'}
                        tone={liveDispatch.status === 'IN_TRANSIT' ? 'good' : undefined}
                      />
                    </dl>
                    {vehicleId && (
                      <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                        <Link to="/app/vehicles/$vehicleId" params={{ vehicleId }}>
                          View vehicle
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Truck}
                    title="No vehicle"
                    description={canAssign ? 'Assign a vehicle to this driver.' : undefined}
                    action={
                      canAssign ? (
                        <Button size="sm" variant="outline" onClick={() => setAssignVehicleOpen(true)}>
                          Assign vehicle
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </section>

            {/* Documents */}
            <section id="section-documents" className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={FileText} title="Documents" className="border-b border-border/50 px-4 py-3" />
              <DriverDocumentsSection driverId={driver.id} />
            </section>

            {/* Activity Timeline */}
            <section id="section-timeline" className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={History} title="Activity Timeline" className="border-b border-border/50 px-4 py-3" />
              <div className="px-4 py-3">
                {activity.length === 0 ? (
                  <EmptyState compact icon={History} title="No activity yet" description="Events appear as the driver is assigned dispatches." />
                ) : (
                  <ul className="relative space-y-0">
                    {activity.slice(0, 6).map((item, idx) => {
                      const style = TIMELINE_STYLE[item.kind];
                      const Icon = style.icon;
                      return (
                        <li key={item.id} className="relative flex gap-2.5 pb-3.5 last:pb-0">
                          {idx < Math.min(activity.length, 6) - 1 && (
                            <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border/60" aria-hidden />
                          )}
                          <span className={cn(
                            'relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]',
                            style.dot,
                          )}>
                            <Icon className="h-3 w-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium leading-tight text-foreground">{item.title}</p>
                            {item.detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.detail}</p>}
                            <p className="mt-0.5 text-[10px] text-muted-foreground/60" title={formatDateTime(item.at)}>
                              {formatRelativeTime(item.at)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {activity.length > 6 && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    +{activity.length - 6} more events
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Employment & Availability */}
          {(driver.preferredRegions || (driver.availableDays?.length ?? 0) > 0 || driver.driverNotes || driver.internalNotes) && (
            <section className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={Briefcase} title="Employment & Availability" className="border-b border-border/50 px-5 py-3" />
              <div className="divide-y divide-border/40 px-5">
                {driver.preferredRegions && (
                  <div className="flex items-start justify-between gap-3 py-3">
                    <dt className="shrink-0 text-xs text-muted-foreground">Preferred routes</dt>
                    <dd className="text-right text-xs font-medium text-foreground/80">{driver.preferredRegions}</dd>
                  </div>
                )}
                {(driver.availableDays?.length ?? 0) > 0 && (
                  <div className="flex items-start justify-between gap-3 py-3">
                    <dt className="shrink-0 text-xs text-muted-foreground">Available days</dt>
                    <dd className="flex flex-wrap justify-end gap-1">
                      {(['MON','TUE','WED','THU','FRI','SAT','SUN'] as const).map((d) => (
                        <span
                          key={d}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            driver.availableDays?.includes(d) ? 'bg-brand/15 text-brand' : 'bg-muted/30 text-muted-foreground/40',
                          )}
                        >
                          {d.charAt(0) + d.slice(1).toLowerCase()}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {driver.driverNotes && (
                  <div className="py-3">
                    <dt className="mb-1 text-xs text-muted-foreground">Driver notes</dt>
                    <dd className="text-xs text-foreground/80">{driver.driverNotes}</dd>
                  </div>
                )}
                {driver.internalNotes && (
                  <div className="py-3">
                    <dt className="mb-1 text-xs text-muted-foreground">Internal notes</dt>
                    <dd className="text-xs text-foreground/80">{driver.internalNotes}</dd>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Emergency Contact */}
          {driver.emergencyContact && (
            <section className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={HeartPulse} title="Emergency Contact" className="border-b border-border/50 px-5 py-3" />
              <div className="divide-y divide-border/40 px-5">
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="shrink-0 text-xs text-muted-foreground">Name</dt>
                  <dd className="text-xs font-semibold text-foreground">{driver.emergencyContact.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="shrink-0 text-xs text-muted-foreground">Relationship</dt>
                  <dd className="text-xs font-medium text-foreground/80">{driver.emergencyContact.relationship}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="shrink-0 text-xs text-muted-foreground">Phone</dt>
                  <dd className="text-xs font-medium">
                    <a href={`tel:${driver.emergencyContact.phone}`} className="text-brand hover:underline">
                      {driver.emergencyContact.phone}
                    </a>
                  </dd>
                </div>
                {driver.emergencyContact.alternatePhone && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="shrink-0 text-xs text-muted-foreground">Alt. phone</dt>
                    <dd className="text-xs font-medium">
                      <a href={`tel:${driver.emergencyContact.alternatePhone}`} className="text-brand hover:underline">
                        {driver.emergencyContact.alternatePhone}
                      </a>
                    </dd>
                  </div>
                )}
                {driver.emergencyContact.email && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="shrink-0 text-xs text-muted-foreground">Email</dt>
                    <dd className="text-xs font-medium">
                      <a href={`mailto:${driver.emergencyContact.email}`} className="text-brand hover:underline">
                        {driver.emergencyContact.email}
                      </a>
                    </dd>
                  </div>
                )}
                {driver.emergencyContact.address && (
                  <div className="flex items-start justify-between gap-3 py-3">
                    <dt className="shrink-0 text-xs text-muted-foreground">Address</dt>
                    <dd className="text-right text-xs text-foreground/80">{driver.emergencyContact.address}</dd>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Driver app access */}
          {!driver.archivedAt && (
            <section className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <SectionHeader icon={Link2} title="Driver App Access" className="border-b border-border/50 px-5 py-3" />
              <div className="px-5 py-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Link an active DRIVER-role login so they can open My Deliveries.
                </p>
                {driver.userId ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-4 py-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {linkedMember ? `${linkedMember.user.firstName} ${linkedMember.user.lastName}` : 'Login linked'}
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
                      description="They lose My Deliveries access until linked again."
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
                      <option value="">{membersLoading ? 'Loading…' : 'Select a DRIVER member…'}</option>
                      {driverLogins.map((m) => (
                        <option key={m.user.id} value={m.user.id}>
                          {m.user.firstName} {m.user.lastName} — {m.user.email}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => void handleLink()} disabled={busy || !selectedUserId} className="gap-2">
                      <Link2 className="h-3.5 w-3.5" />
                      Link login
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── Right Sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
          <div className="space-y-4">

            {/* Quick Actions */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <p className="border-b border-border/50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick Actions
              </p>
              <div className="p-2 space-y-0.5">
                <SidebarBtn href={`tel:${driver.phone}`} icon={Phone} label="Call driver" />
                {driver.email && <SidebarBtn href={`mailto:${driver.email}`} icon={Mail} label="Send message" />}
                {canAssign && (
                  <>
                    <SidebarBtn onClick={() => setAssignVehicleOpen(true)} icon={Truck} label="Assign vehicle" />
                    <SidebarBtn onClick={() => setAssignDispatchOpen(true)} icon={UserRoundCog} label="Assign to order" />
                  </>
                )}
                {liveDispatch?.orderId && (
                  <SidebarBtn
                    to="/app/orders/$orderId"
                    params={{ orderId: liveDispatch.orderId }}
                    icon={ExternalLink}
                    label="View current order"
                  />
                )}
                {!driver.archivedAt && (
                  <SidebarBtn onClick={() => setEditOpen(true)} icon={Edit2} label="Edit driver" />
                )}
                {!driver.archivedAt && (
                  <SidebarBtn onClick={() => setStatusOpen(true)} icon={Clock} label="Change status" />
                )}
                <div className="my-1 border-t border-border/40" />
                {driver.archivedAt ? (
                  <SidebarBtn onClick={() => void handleRestore()} icon={RotateCcw} label="Restore driver" disabled={busy} />
                ) : (
                  <SidebarBtn
                    onClick={() => setShowArchive(true)}
                    icon={Archive}
                    label="Archive driver"
                    destructive
                    disabled={busy}
                  />
                )}
              </div>
            </div>

            {/* Driver Info */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <p className="border-b border-border/50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Driver Info
              </p>
              <dl className="divide-y divide-border/40 px-4 py-1 text-xs">
                <SidebarInfoRow label="Status" value={driver.archivedAt ? 'Archived' : driver.status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} highlight />
                <SidebarInfoRow label="Driver ID" value={driver.employeeCode} mono />
                <SidebarInfoRow label="License" value={driver.licenseNumber ?? '—'} mono />
                {driver.licenseClass && (
                  <SidebarInfoRow label="License class" value={driver.licenseClass.replace('CLASS_', 'Class ').replace('_', ' ')} />
                )}
                <SidebarInfoRow
                  label="License expiry"
                  value={driver.licenseExpiry ? formatDate(driver.licenseExpiry) : '—'}
                  tone={isLicenseExpired(driver.licenseExpiry) ? 'bad' : isLicenseExpiring(driver.licenseExpiry) ? 'warn' : undefined}
                />
                {driver.employmentType && (
                  <SidebarInfoRow label="Employment" value={driver.employmentType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} />
                )}
                {driver.hireDate && (
                  <SidebarInfoRow label="Hire date" value={formatDate(driver.hireDate)} />
                )}
                {driver.department && (
                  <SidebarInfoRow label="Department" value={driver.department} />
                )}
                {driver.baseLocation && (
                  <SidebarInfoRow label="Base location" value={driver.baseLocation} />
                )}
                {driver.workShift && (
                  <SidebarInfoRow label="Work shift" value={driver.workShift.charAt(0).toUpperCase() + driver.workShift.slice(1).toLowerCase()} />
                )}
                <SidebarInfoRow label="Created" value={formatDate(driver.createdAt)} />
                <SidebarInfoRow label="Updated" value={formatRelativeTime(driver.updatedAt)} />
                {customerId && (
                  <SidebarInfoRow label="Customer" value={liveDispatch?.order?.customer?.companyName ?? '—'} />
                )}
              </dl>
            </div>

            {/* Jump To */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-surface">
              <p className="border-b border-border/50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Jump To
              </p>
              <div className="p-2 space-y-0.5">
                {[
                  { id: 'section-assignment', icon: Truck, label: 'Current Assignment' },
                  { id: 'section-trips', icon: Route, label: 'Orders & Trips' },
                  { id: 'section-vehicle', icon: Truck, label: 'Vehicle Information' },
                  { id: 'section-documents', icon: FileText, label: 'Documents' },
                  { id: 'section-timeline', icon: History, label: 'Activity Timeline' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollTo(item.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </aside>
      </div>

      {/* Dialogs / Sheets */}
      <ConfirmDialog
        open={showArchive}
        onOpenChange={setShowArchive}
        trigger={<span className="sr-only" />}
        title="Archive this driver?"
        description="Archived drivers cannot be assigned. Blocked if they still have a live dispatch."
        confirmLabel={archiving ? 'Archiving…' : 'Archive'}
        onConfirm={handleArchive}
        destructive
      />

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

// ─── Progress bar ─────────────────────────────────────────────────────────────

function DispatchProgressBar({ live }: { live: ApiDispatch }) {
  const [pickup, transit, delivery] = getDispatchStages(live.status);

  const stageIcon = (s: StageState) => {
    if (s === 'done') return <CheckCircle2 className="h-4 w-4" />;
    if (s === 'active') return <Truck className="h-4 w-4" />;
    return <span className="h-3.5 w-3.5 rounded-full border-2 border-current opacity-40" />;
  };

  const stageCls = (s: StageState) =>
    s === 'done' ? 'text-success' : s === 'active' ? 'text-brand' : 'text-muted-foreground/40';

  const lineCls = (s: StageState) =>
    s === 'done' ? 'bg-success' : s === 'active' ? 'bg-brand/50' : 'bg-border/40';

  return (
    <div className="flex items-start gap-0">
      {/* Pickup node */}
      <div className="flex min-w-[120px] flex-col items-start gap-1">
        <div className={cn('flex items-center gap-1.5', stageCls(pickup))}>
          {stageIcon(pickup)}
          <span className="text-xs font-semibold">Pickup</span>
        </div>
        <p className="pl-0.5 text-[10px] text-muted-foreground">
          {formatDate(live.pickupDateScheduled)}
        </p>
        {live.pickupDateActual && (
          <p className="pl-0.5 text-[10px] text-success">Actual: {formatDate(live.pickupDateActual)}</p>
        )}
      </div>

      {/* Line 1 */}
      <div className={cn('mx-1 mt-2 h-0.5 flex-1', lineCls(transit))} />

      {/* Transit node */}
      <div className="flex flex-col items-center gap-1">
        <div className={cn('flex items-center gap-1.5', stageCls(transit))}>
          {stageIcon(transit)}
          <span className="text-xs font-semibold">In Transit</span>
        </div>
        <p className="text-[10px] text-muted-foreground">{statusLabel(live.status)}</p>
      </div>

      {/* Line 2 */}
      <div className={cn('mx-1 mt-2 h-0.5 flex-1', lineCls(delivery))} />

      {/* Delivery node */}
      <div className="flex min-w-[120px] flex-col items-end gap-1">
        <div className={cn('flex items-center gap-1.5', stageCls(delivery))}>
          <span className="text-xs font-semibold">Delivery</span>
          {stageIcon(delivery)}
        </div>
        <p className="pr-0.5 text-[10px] text-muted-foreground">
          {formatDate(live.deliveryDateScheduled)}
        </p>
        {live.deliveryDateActual && (
          <p className="pr-0.5 text-[10px] text-success">Actual: {formatDate(live.deliveryDateActual)}</p>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OpsChip({ badge }: { badge: DriverOpsBadge }) {
  // Color override for blue "driving" state
  const cls = badge.key === 'driving' || badge.key === 'waiting'
    ? 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/25'
    : badge.key === 'resting'
      ? 'bg-violet-500/15 text-violet-400 ring-1 ring-inset ring-violet-500/25'
      : badge.className;
  const label = badge.key === 'driving' || badge.key === 'waiting' ? 'On Trip'
    : badge.key === 'assigned' ? 'Assigned'
    : badge.key === 'resting' ? 'On Leave'
    : badge.label;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4', cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, className }: { icon: typeof User; title: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
    </div>
  );
}

function InfoRow({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-destructive' : 'text-foreground/80';
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-right font-medium', mono && 'font-mono', cls)}>{value}</dd>
    </div>
  );
}

function SidebarInfoRow({
  label, value, mono, tone, highlight,
}: {
  label: string; value: string; mono?: boolean; tone?: 'warn' | 'bad'; highlight?: boolean;
}) {
  const cls = tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning' : highlight ? 'font-semibold text-foreground' : 'text-foreground/80';
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-right text-xs', mono && 'font-mono', cls)}>{value}</dd>
    </div>
  );
}

function SidebarBtn({
  onClick, href, to, params, icon: Icon, label, destructive: isDestructive, disabled,
}: {
  onClick?: () => void;
  href?: string;
  to?: string;
  params?: Record<string, string>;
  icon: typeof Phone;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const cls = cn(
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors',
    isDestructive
      ? 'text-destructive hover:bg-destructive/10'
      : 'text-foreground/80 hover:bg-muted/40 hover:text-foreground',
    disabled && 'pointer-events-none opacity-50',
  );
  if (href) return <a href={href} className={cls}><Icon className="h-3.5 w-3.5 shrink-0" />{label}</a>;
  if (to) {
    return (
      <Link to={to as never} params={params as never} className={cls}>
        <Icon className="h-3.5 w-3.5 shrink-0" />{label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      <Icon className="h-3.5 w-3.5 shrink-0" />{label}
    </button>
  );
}
