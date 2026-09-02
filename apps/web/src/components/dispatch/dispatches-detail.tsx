'use client';

import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';
import { DispatchTimeline } from '@/components/dispatch/dispatch-timeline';
import { DispatchStatusSheet } from '@/components/dispatch/dispatch-status-sheet';
import { DispatchNotesSheet } from '@/components/dispatch/dispatch-notes-sheet';
import { DispatchReassignSheet } from '@/components/dispatch/dispatch-reassign-sheet';
import { DispatchRouteMap } from '@/components/dispatch/dispatch-route-map';
import { useDispatchDetail, useCancelDispatch } from '@/lib/hooks/use-dispatches';
import { useOrder } from '@/lib/api/orders';
import { useDriver, useDriversList } from '@/lib/api/drivers';
import { useVehicle, useVehiclesList } from '@/lib/api/vehicles';
import { useCustomerDetail } from '@/lib/api/customers';
import { useInvoicesQuery, useCreateInvoiceFromOrderMutation } from '@/lib/api/invoices';
import { InvoiceDetailSheet } from '@/components/finance/invoice-detail-sheet';
import { useExpensesQuery } from '@/lib/api/expenses';
import { useLiveFleetQuery } from '@/lib/api/telematics';
import { useCurrentUser } from '@/lib/api/auth';
import { DispatchOperationalTimeline } from '@/components/dispatch/dispatch-operational-timeline';
import { DispatchConflictPanel } from '@/components/dispatch/dispatch-conflict-panel';
import { ProofOfDeliveryPanel } from '@/components/dispatch/proof-of-delivery-panel';
import type { DirectionsResult } from '@/lib/api/tracking-map';
import {
  DISPATCH_WRITE_ROLES,
  FLEET_ROLES,
  INVOICE_READ_ROLES,
  EXPENSE_READ_ROLES,
  AUDIT_ROLES,
} from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import type { ApiDispatchStop, DispatchStatus } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { formatMoney, formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isDispatchOverdue } from '@/components/dispatch/dispatch-ops';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  Mail,
  MapPin,
  Navigation,
  Package,
  Phone,
  Radio,
  Receipt,
  Repeat,
  Route as RouteIcon,
  Ruler,
  Scale,
  StickyNote,
  Truck,
  User,
  Wallet,
  XCircle,
} from 'lucide-react';

interface DispatchesDetailProps {
  dispatchId: string;
}

const NEXT_ACTION_LABEL: Partial<Record<DispatchStatus, string>> = {
  ASSIGNED: 'Assign to driver',
  EN_ROUTE_TO_PICKUP: 'Head to pickup',
  AT_PICKUP: 'Arrived at pickup',
  IN_TRANSIT: 'Start transit',
  AT_STOP: 'At intermediate stop',
  ARRIVED_AT_DELIVERY: 'Arrived at delivery',
  DELIVERED: 'Mark delivered',
};

const DISPATCH_LIFECYCLE: DispatchStatus[] = [
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'ARRIVED_AT_DELIVERY',
  'DELIVERED',
];

const LIFECYCLE_LABELS: Partial<Record<DispatchStatus, string>> = {
  EN_ROUTE_TO_PICKUP: 'Head to pickup',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'Transit',
  AT_STOP: 'At stop',
  ARRIVED_AT_DELIVERY: 'Arrived',
  DELIVERED: 'Delivered',
};

const STATUS_RANK: Partial<Record<DispatchStatus, number>> = {
  DRAFT: 0,
  ASSIGNED: 1,
  EN_ROUTE_TO_PICKUP: 2,
  AT_PICKUP: 3,
  IN_TRANSIT: 4,
  AT_STOP: 5,
  ARRIVED_AT_DELIVERY: 6,
  DELIVERED: 7,
};

const FAILURE_REASON_LABELS: Record<string, string> = {
  CUSTOMER_UNAVAILABLE: 'Customer unavailable',
  CUSTOMER_REFUSED: 'Customer refused delivery',
  WRONG_ADDRESS: 'Wrong address',
  ACCESS_PROBLEM: 'Access problem',
  DAMAGED_CARGO: 'Damaged cargo',
  VEHICLE_PROBLEM: 'Vehicle problem',
  OTHER: 'Other',
};

type SheetMode = 'status' | 'notes' | 'reassign' | null;

function initials(first?: string | null, last?: string | null): string {
  return `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}` || '?';
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m} m`;
}
function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DispatchesDetail({ dispatchId }: DispatchesDetailProps) {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canWrite = Boolean(role && DISPATCH_WRITE_ROLES.includes(role));
  const canViewFleet = Boolean(role && FLEET_ROLES.includes(role));
  const canViewInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));
  const canViewExpenses = Boolean(role && EXPENSE_READ_ROLES.includes(role));
  const canViewAudit = Boolean(role && AUDIT_ROLES.includes(role));

  const { data: dispatch, loading, error, refetch } = useDispatchDetail(dispatchId);
  const { data: order, loading: orderLoading } = useOrder(dispatch?.orderId ?? '');
  const { data: driver } = useDriver(dispatch?.driverId ?? '');
  const { data: vehicle } = useVehicle(dispatch?.vehicleId ?? '');
  const { items: driversList } = useDriversList(
    { limit: 100, includeArchived: true },
    { enabled: Boolean(canViewFleet && canViewAudit && dispatch) },
  );
  const { items: vehiclesList } = useVehiclesList(
    { limit: 100, includeArchived: true },
    { enabled: Boolean(canViewFleet && canViewAudit && dispatch) },
  );
  const { data: customer } = useCustomerDetail(order?.customerId ?? '');

  const {
    data: invoicesForOrder,
    isPending: invoicesLoading,
    isError: invoicesError,
    refetch: refetchInvoices,
  } = useInvoicesQuery(
    { orderId: dispatch?.orderId, limit: 5 },
    Boolean(canViewInvoices && dispatch?.orderId),
  );
  const invoice = invoicesForOrder?.items[0] ?? null;

  const expensesQuery = useExpensesQuery(
    { orderId: dispatch?.orderId, limit: 50 },
    { enabled: Boolean(canViewExpenses && dispatch?.orderId) },
  );
  const expenses = expensesQuery.data?.items ?? [];

  const liveFleet = useLiveFleetQuery({
    enabled: Boolean(canViewFleet && dispatch?.vehicleId),
    refetchInterval: canViewFleet && dispatch?.vehicleId ? 30_000 : undefined,
  });
  const liveVehicle = useMemo(() => {
    if (!dispatch?.vehicleId || !liveFleet.data) return null;
    return liveFleet.data.find((v) => v.vehicleId === dispatch.vehicleId) ?? null;
  }, [liveFleet.data, dispatch?.vehicleId]);

  const { cancel, loading: cancelling } = useCancelDispatch(dispatchId);
  const { mutateAsync: createInvoiceFromOrder, isPending: creatingInvoice } =
    useCreateInvoiceFromOrderMutation();

  const [sheet, setSheet] = useState<SheetMode>(null);
  const [statusPreset, setStatusPreset] = useState<DispatchStatus | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [invoiceSheetId, setInvoiceSheetId] = useState<string | null>(null);
  const [directions, setDirections] = useState<DirectionsResult | null>(null);

  const overdue = dispatch ? isDispatchOverdue(dispatch) : false;

  const expenseTotal = useMemo(() => {
    if (!order || expenses.length === 0) return null;
    let sum = 0;
    for (const e of expenses) {
      if (e.currency === order.currency) sum += Number(e.amount);
    }
    return Number.isFinite(sum) ? sum : null;
  }, [expenses, order]);

  const margin = order && expenseTotal != null ? Number(order.price) - expenseTotal : null;

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of driversList) map.set(d.id, `${d.firstName} ${d.lastName}`.trim());
    if (dispatch?.driver)
      map.set(dispatch.driver.id, `${dispatch.driver.firstName} ${dispatch.driver.lastName}`.trim());
    if (driver) map.set(driver.id, `${driver.firstName} ${driver.lastName}`.trim());
    return map;
  }, [driversList, dispatch?.driver, driver]);

  const vehiclePlateById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehiclesList) map.set(v.id, v.plateNumber);
    if (dispatch?.vehicle) map.set(dispatch.vehicle.id, dispatch.vehicle.plateNumber);
    if (vehicle) map.set(vehicle.id, vehicle.plateNumber);
    return map;
  }, [vehiclesList, dispatch?.vehicle, vehicle]);

  const resolveDriverName = useCallback(
    (id: string | null | undefined) => (id ? (driverNameById.get(id) ?? 'Unknown driver') : '—'),
    [driverNameById],
  );
  const resolveVehiclePlate = useCallback(
    (id: string | null | undefined) => (id ? (vehiclePlateById.get(id) ?? 'Unknown vehicle') : '—'),
    [vehiclePlateById],
  );

  const outstanding = invoice ? Number(invoice.totalAmount) - Number(invoice.paidAmount ?? 0) : null;
  const collected = invoice ? Number(invoice.paidAmount ?? 0) : null;

  if (loading) return <LoadingState label="Loading dispatch..." />;
  if (error || !dispatch) {
    return <ErrorState message={error || 'Dispatch not found'} onRetry={refetch} />;
  }

  const validNextStatuses = canWrite
    ? (dispatch.allowedTransitions.filter((s) => s !== 'CANCELLED') as DispatchStatus[])
    : [];
  const canCancel = canWrite && dispatch.allowedTransitions.includes('CANCELLED');
  const canReassign = canWrite && dispatch.allowedTransitions.length > 0;
  const primaryNext = validNextStatuses[0] ?? null;
  const customerLabel =
    customer?.companyName ?? dispatch.order?.customer?.companyName ?? 'Customer';
  const currentRank = STATUS_RANK[dispatch.status as DispatchStatus] ?? 0;

  // Coordinates — prefer dispatch stops (geocoded snapshot), fall back to order
  const pickupStop = dispatch.stops?.find((s: ApiDispatchStop) => s.stopType === 'PICKUP');
  const deliveryStop = dispatch.stops?.find((s: ApiDispatchStop) => s.stopType === 'DELIVERY');
  const pickupLat =
    pickupStop?.lat != null ? Number(pickupStop.lat) : (order?.pickupLat ?? null);
  const pickupLng =
    pickupStop?.lng != null ? Number(pickupStop.lng) : (order?.pickupLng ?? null);
  const deliveryLat =
    deliveryStop?.lat != null ? Number(deliveryStop.lat) : (order?.deliveryLat ?? null);
  const deliveryLng =
    deliveryStop?.lng != null ? Number(deliveryStop.lng) : (order?.deliveryLng ?? null);

  // Driver info
  const driverFirst = driver?.firstName ?? dispatch.driver?.firstName ?? '';
  const driverLast = driver?.lastName ?? dispatch.driver?.lastName ?? '';
  const driverEmployeeCode = driver?.employeeCode ?? dispatch.driver?.employeeCode;
  const driverPhone = driver?.phone ?? dispatch.driver?.phone;
  const driverStatus = driver?.status ?? dispatch.driver?.status;
  const driverLicenseExpiry = driver?.licenseExpiry;
  const licenseExpired = driverLicenseExpiry
    ? new Date(driverLicenseExpiry) < new Date()
    : false;

  // Vehicle info
  const vehiclePlate = vehicle?.plateNumber ?? dispatch.vehicle?.plateNumber;
  const vehicleType = vehicle?.type ?? dispatch.vehicle?.type;
  const vehicleCode = vehicle?.vehicleCode ?? dispatch.vehicle?.vehicleCode;
  const vehicleStatus = vehicle?.status ?? dispatch.vehicle?.status;
  const vehicleCapacityKg = vehicle?.capacityKg;
  const vehicleCapacityM3 = vehicle?.capacityM3;
  const vehicleInsuranceExpiry = vehicle?.insuranceExpiry;
  const vehicleInspectionExpiry = vehicle?.inspectionExpiry;
  const insuranceExpired = vehicleInsuranceExpiry
    ? new Date(vehicleInsuranceExpiry) < new Date()
    : false;
  const inspectionExpired = vehicleInspectionExpiry
    ? new Date(vehicleInspectionExpiry) < new Date()
    : false;

  const openStatus = (preset?: DispatchStatus | null) => {
    setStatusPreset(preset ?? null);
    setSheet('status');
  };

  const handleCancel = async () => {
    try {
      await cancel();
      toast.success('Dispatch cancelled');
      setShowCancel(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to cancel dispatch'));
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-2 pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/dispatches' })}
          className="transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Dispatch
        </button>
        <ChevronRight className="h-3 w-3" />
        <button
          type="button"
          onClick={() => navigate({ to: '/app/dispatches/board' })}
          className="transition-colors hover:text-foreground"
        >
          Board
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{dispatch.dispatchNumber}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-sm">

        {/* ─── Header ─── */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-tight">{dispatch.dispatchNumber}</h1>
              <StatusBadge status={dispatch.status} />
              {overdue && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  Late
                </Badge>
              )}
              {dispatch.driverAcceptanceStatus && dispatch.driverAcceptanceStatus !== 'PENDING' && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    dispatch.driverAcceptanceStatus === 'ACCEPTED'
                      ? 'bg-success/15 text-success'
                      : 'bg-destructive/15 text-destructive',
                  )}
                >
                  Driver {dispatch.driverAcceptanceStatus.toLowerCase()}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                {dispatch.order?.pickupCity ?? order?.pickupCity ?? '—'}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {dispatch.order?.deliveryCity ?? order?.deliveryCity ?? '—'}
              </span>
              {order?.customerId ? (
                <Link
                  to="/app/customers/$customerId"
                  params={{ customerId: order.customerId }}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {customerLabel}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {customerLabel}
                </span>
              )}
              {(driverFirst || driverLast) && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  {driverFirst} {driverLast}
                </span>
              )}
              {vehiclePlate && (
                <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                  <Truck className="h-3.5 w-3.5" />
                  {vehiclePlate}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {primaryNext && (
              <Button
                size="sm"
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                onClick={() => openStatus(primaryNext)}
              >
                {NEXT_ACTION_LABEL[primaryNext] ?? statusLabel(primaryNext)}
              </Button>
            )}
            {validNextStatuses.length > 1 && (
              <Button size="sm" variant="outline" onClick={() => openStatus(null)}>
                Update status
              </Button>
            )}
            {canReassign && (
              <Button size="sm" variant="outline" onClick={() => setSheet('reassign')}>
                <Repeat className="mr-1.5 h-3.5 w-3.5" />
                Reassign
              </Button>
            )}
            {driverPhone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${driverPhone}`}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Call driver
                </a>
              </Button>
            )}
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => setSheet('notes')}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            {canCancel && (
              <ConfirmDialog
                open={showCancel}
                onOpenChange={setShowCancel}
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    disabled={cancelling}
                  >
                    Cancel
                  </Button>
                }
                title={`Cancel ${dispatch.dispatchNumber}?`}
                description="Driver and vehicle are released; the order returns to the unassigned pool."
                confirmLabel={cancelling ? 'Cancelling…' : 'Cancel dispatch'}
                cancelLabel="Keep"
                onConfirm={handleCancel}
                destructive
              />
            )}
          </div>
        </div>

        {/* ─── Lifecycle stepper ─── */}
        <div className="border-b border-border/60 px-5 py-3">
          <DispatchTimeline
            dispatch={dispatch}
            live={liveVehicle}
            overdue={overdue}
            onStageClick={
              canWrite
                ? (s) => {
                    if (validNextStatuses.includes(s)) openStatus(s);
                    else openStatus(null);
                  }
                : undefined
            }
          />
        </div>

        {/* ─── Body: main content | sticky sidebar ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,28%)]">
          <div className="divide-y divide-border/50 lg:border-r lg:border-border/50">

            {/* ─── Route Map + Route Info ─── */}
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_240px]">
                {/* Map */}
                <DispatchRouteMap
                  pickupLat={pickupLat}
                  pickupLng={pickupLng}
                  deliveryLat={deliveryLat}
                  deliveryLng={deliveryLng}
                  liveLat={liveVehicle?.latitude}
                  liveLng={liveVehicle?.longitude}
                  onDirections={setDirections}
                  className="h-[340px] md:h-[380px]"
                />

                {/* Route info panel */}
                <div className="flex flex-col gap-0">
                  {/* Pickup card */}
                  <div className="rounded-t-xl border border-border/60 bg-muted/10 px-4 py-3">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-brand">
                      <MapPin className="h-3 w-3" />
                      Pickup
                    </div>
                    <p className="text-base font-bold leading-snug text-foreground">
                      {order?.pickupCity ?? dispatch.order?.pickupCity ?? '—'}
                    </p>
                    {order?.pickupAddress && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{order.pickupAddress}</p>
                    )}
                    <div className="mt-2 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Planned</span>
                        <span className="font-medium tabular-nums">
                          {formatDate(dispatch.pickupDateScheduled)}
                        </span>
                      </div>
                      {dispatch.pickupDateActual && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Actual</span>
                          <span className="font-medium tabular-nums text-success">
                            {formatDateTime(dispatch.pickupDateActual)}
                          </span>
                        </div>
                      )}
                      {pickupStop?.windowStart && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Window</span>
                          <span className="font-medium tabular-nums">
                            {formatDateTime(pickupStop.windowStart)}
                            {pickupStop.windowEnd ? ` – ${formatDateTime(pickupStop.windowEnd)}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    {pickupStop?.contactName && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {pickupStop.contactName}
                        {pickupStop.contactPhone && ` · ${pickupStop.contactPhone}`}
                      </p>
                    )}
                  </div>

                  {/* Distance/duration bridge */}
                  <div className="flex items-center justify-center border-x border-border/60 bg-muted/5 py-2">
                    <div className="flex flex-col items-center gap-0.5 text-center">
                      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                      {directions ? (
                        <>
                          <span className="text-[11px] font-semibold text-foreground">
                            {formatDistance(directions.distanceM)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            est. {formatDuration(directions.durationSec)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">
                          {pickupLat && deliveryLat ? 'Loading route…' : 'No route data'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delivery card */}
                  <div className="rounded-b-xl border border-t-0 border-border/60 bg-muted/10 px-4 py-3">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-success">
                      <MapPin className="h-3 w-3" />
                      Delivery
                      {overdue && (
                        <Badge variant="destructive" className="ml-auto h-4 gap-0.5 px-1 text-[9px]">
                          Late
                        </Badge>
                      )}
                    </div>
                    <p className="text-base font-bold leading-snug text-foreground">
                      {order?.deliveryCity ?? dispatch.order?.deliveryCity ?? '—'}
                    </p>
                    {order?.deliveryAddress && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{order.deliveryAddress}</p>
                    )}
                    <div className="mt-2 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Planned</span>
                        <span className={cn('font-medium tabular-nums', overdue && 'text-destructive')}>
                          {formatDate(dispatch.deliveryDateScheduled)}
                        </span>
                      </div>
                      {dispatch.deliveryDateActual && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Actual</span>
                          <span className="font-medium tabular-nums">
                            {formatDateTime(dispatch.deliveryDateActual)}
                          </span>
                        </div>
                      )}
                      {deliveryStop?.windowStart && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Window</span>
                          <span className="font-medium tabular-nums">
                            {formatDateTime(deliveryStop.windowStart)}
                            {deliveryStop.windowEnd
                              ? ` – ${formatDateTime(deliveryStop.windowEnd)}`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    {deliveryStop?.contactName && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {deliveryStop.contactName}
                        {deliveryStop.contactPhone && ` · ${deliveryStop.contactPhone}`}
                      </p>
                    )}
                  </div>

                  {/* Transit state pill */}
                  <div className="mt-2 rounded-lg border border-border/50 bg-muted/5 px-3 py-2 text-xs">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Transit
                    </p>
                    <p className="mt-0.5 font-medium capitalize text-foreground">
                      {statusLabel(dispatch.status)}
                    </p>
                    {liveVehicle ? (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-brand">
                        <Radio className="h-3 w-3" />
                        {liveVehicle.movementState.toLowerCase()}
                        {liveVehicle.speedKph != null && ` · ${Math.round(liveVehicle.speedKph)} km/h`}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-muted-foreground/50">No live location</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Intermediate Stops */}
            {(dispatch.stops?.filter((s: ApiDispatchStop) => s.stopType === 'INTERMEDIATE').length ?? 0) > 0 && (() => {
              const interStops = dispatch.stops!.filter(
                (s: ApiDispatchStop) => s.stopType === 'INTERMEDIATE',
              );
              return (
                <section className="p-5">
                  <SectionHeader icon={RouteIcon} title={`Intermediate Stops (${interStops.length})`} />
                  <div className="mt-4 space-y-2">
                    {interStops.map((stop: ApiDispatchStop, idx: number) => {
                      const state = stop.failedAt
                        ? 'failed'
                        : stop.completedAt
                          ? 'done'
                          : stop.arrivedAt
                            ? 'active'
                            : 'upcoming';
                      return (
                        <div
                          key={stop.id}
                          className={cn(
                            'rounded-xl border p-3.5',
                            state === 'failed' && 'border-destructive/40 bg-destructive/5',
                            state === 'done' && 'border-success/30 bg-success/5',
                            state === 'active' && 'border-brand/30 bg-brand/5',
                            state === 'upcoming' && 'border-border/40 bg-muted/10',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                {idx + 1}
                              </span>
                              <div>
                                <p className="text-sm font-semibold leading-snug">
                                  {stop.placeName ?? stop.city}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {stop.placeName ? `${stop.city} · ${stop.address}` : stop.address}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={state === 'failed' ? 'destructive' : state === 'done' ? 'default' : state === 'active' ? 'secondary' : 'outline'}
                              className="shrink-0 text-[10px]"
                            >
                              {state === 'failed' ? 'Failed' : state === 'done' ? 'Done' : state === 'active' ? 'At stop' : 'Upcoming'}
                            </Badge>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {stop.contactName && <span><User className="mr-0.5 inline h-3 w-3" />{stop.contactName}</span>}
                            {stop.contactPhone && <span><Phone className="mr-0.5 inline h-3 w-3" />{stop.contactPhone}</span>}
                            {stop.windowStart && (
                              <span>
                                <Clock className="mr-0.5 inline h-3 w-3" />
                                {formatDateTime(stop.windowStart)}
                                {stop.windowEnd ? ` – ${formatDateTime(stop.windowEnd)}` : ''}
                              </span>
                            )}
                            {stop.arrivedAt && <span className="text-foreground">Arrived {formatDateTime(stop.arrivedAt)}</span>}
                            {stop.completedAt && <span className="text-foreground">Departed {formatDateTime(stop.completedAt)}</span>}
                            {stop.failedAt && (
                              <span className="text-destructive">
                                Failed {formatDateTime(stop.failedAt)}
                                {stop.failureReason ? ` — ${FAILURE_REASON_LABELS[stop.failureReason] ?? stop.failureReason}` : ''}
                              </span>
                            )}
                          </div>
                          {stop.instructions && (
                            <p className="mt-2 border-t border-border/30 pt-2 text-xs italic text-muted-foreground">
                              {stop.instructions}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

            {/* Delivery Failure */}
            {dispatch.status === 'DELIVERY_FAILED' && (
              <section className="p-5">
                <SectionHeader icon={XCircle} title="Delivery Failure" destructive />
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoTile label="Failure Reason" value={FAILURE_REASON_LABELS[dispatch.failureReason ?? ''] ?? dispatch.failureReason ?? '—'} />
                  {dispatch.failedAt && <InfoTile label="Failed At" value={formatDateTime(dispatch.failedAt)} />}
                  {dispatch.failureNotes && <InfoTile label="Driver Notes" value={dispatch.failureNotes} />}
                </div>
                {(dispatch.deliveryAttempts?.length ?? 0) > 1 && (
                  <div className="mt-4 space-y-2">
                    {dispatch.deliveryAttempts!.map((a, idx) => (
                      <div key={a.id} className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">Attempt {idx + 1}</p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">{formatDateTime(a.occurredAt)}</p>
                        </div>
                        <p className="mt-1 text-sm">{FAILURE_REASON_LABELS[a.failureReason] ?? a.failureReason}</p>
                        {a.notes && <p className="mt-1 text-[11px] text-muted-foreground">{a.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Assignment */}
            <section className="p-5">
              <SectionHeader
                icon={User}
                title="Assignment"
                action={
                  canReassign ? (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSheet('reassign')}>
                      <Edit2 className="mr-1 h-3 w-3" />
                      Reassign
                    </Button>
                  ) : undefined
                }
              />
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Driver */}
                <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver</p>
                  {driverFirst || driverLast ? (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand">
                          {initials(driverFirst, driverLast)}
                        </div>
                        <div className="min-w-0 flex-1">
                          {canViewFleet && dispatch.driverId ? (
                            <Link to="/app/drivers/$driverId" params={{ driverId: dispatch.driverId }}
                              className="text-sm font-semibold text-foreground hover:text-brand hover:underline">
                              {driverFirst} {driverLast}
                            </Link>
                          ) : (
                            <p className="text-sm font-semibold">{driverFirst} {driverLast}</p>
                          )}
                          {driverEmployeeCode && (
                            <p className="font-mono text-[11px] text-muted-foreground">{driverEmployeeCode}</p>
                          )}
                          {driverStatus && <p className="mt-1"><StatusBadge status={driverStatus} /></p>}
                        </div>
                      </div>
                      {dispatch.driverAcceptanceStatus && (
                        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>Acceptance:</span>
                          <span className={cn('font-medium',
                            dispatch.driverAcceptanceStatus === 'ACCEPTED' && 'text-success',
                            dispatch.driverAcceptanceStatus === 'REJECTED' && 'text-destructive',
                            dispatch.driverAcceptanceStatus === 'PENDING' && 'text-amber-500',
                          )}>
                            {dispatch.driverAcceptanceStatus.charAt(0) + dispatch.driverAcceptanceStatus.slice(1).toLowerCase()}
                          </span>
                        </div>
                      )}
                      {driverPhone && (
                        <a href={`tel:${driverPhone}`}
                          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
                          <Phone className="h-3 w-3" />
                          {driverPhone}
                        </a>
                      )}
                      {driverLicenseExpiry && (
                        <p className={cn('mt-1.5 text-[11px]', licenseExpired ? 'text-destructive' : 'text-muted-foreground')}>
                          License exp. {formatDate(driverLicenseExpiry)}
                          {licenseExpired && ' — Expired'}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No driver assigned</p>
                  )}
                </div>

                {/* Vehicle */}
                <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</p>
                  {vehiclePlate ? (
                    <>
                      <div className="relative mb-3 h-[52px] w-[84px] overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                        <img src="/isuzi.png" alt={vehiclePlate}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }} />
                      </div>
                      {canViewFleet && dispatch.vehicleId ? (
                        <Link to="/app/vehicles/$vehicleId" params={{ vehicleId: dispatch.vehicleId }}
                          className="font-mono text-sm font-semibold text-foreground hover:text-brand hover:underline">
                          {vehiclePlate}
                        </Link>
                      ) : (
                        <p className="font-mono text-sm font-semibold">{vehiclePlate}</p>
                      )}
                      <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                        {vehicleType?.toLowerCase().replace(/_/g, ' ')}
                        {vehicleCode ? ` · ${vehicleCode}` : ''}
                      </p>
                      {vehicleStatus && <p className="mt-1.5"><StatusBadge status={vehicleStatus} /></p>}
                      {(vehicleCapacityKg || vehicleCapacityM3) && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {vehicleCapacityKg ? `${vehicleCapacityKg} kg` : ''}
                          {vehicleCapacityKg && vehicleCapacityM3 ? ' · ' : ''}
                          {vehicleCapacityM3 ? `${vehicleCapacityM3} m³` : ''}
                        </p>
                      )}
                      {(vehicleInsuranceExpiry || vehicleInspectionExpiry) && (
                        <div className="mt-1.5 space-y-0.5 text-[11px]">
                          {vehicleInsuranceExpiry && (
                            <p className={insuranceExpired ? 'text-destructive' : 'text-muted-foreground'}>
                              Ins. exp. {formatDate(vehicleInsuranceExpiry)}{insuranceExpired && ' — Expired'}
                            </p>
                          )}
                          {vehicleInspectionExpiry && (
                            <p className={inspectionExpired ? 'text-destructive' : 'text-muted-foreground'}>
                              Insp. exp. {formatDate(vehicleInspectionExpiry)}{inspectionExpired && ' — Expired'}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No vehicle assigned</p>
                  )}
                </div>

                {/* Dispatcher */}
                <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dispatcher</p>
                  {dispatch.createdBy ? (
                    <>
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                          {initials(dispatch.createdBy.firstName, dispatch.createdBy.lastName)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{dispatch.createdBy.firstName} {dispatch.createdBy.lastName}</p>
                          <p className="text-[11px] text-muted-foreground">{dispatch.createdBy.email}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Created {formatDateTime(dispatch.createdAt)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </section>

            {/* Shipment */}
            <section className="p-5">
              <SectionHeader icon={Package} title="Shipment" />
              <div className="mt-4">
                {orderLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : order ? (
                  <>
                    <p className="mb-3 text-sm leading-relaxed">{order.cargoDescription}</p>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <CargoStat icon={Scale} label="Weight" value={order.cargoWeightKg ? `${order.cargoWeightKg} kg` : 'Not set'} empty={!order.cargoWeightKg} />
                      <CargoStat icon={Ruler} label="Volume" value={order.cargoVolumeM3 ? `${order.cargoVolumeM3} m³` : 'Not set'} empty={!order.cargoVolumeM3} />
                      <CargoStat icon={Truck} label="Vehicle type"
                        value={vehicleType ? vehicleType.toLowerCase().replace(/_/g, ' ') : 'Unassigned'}
                        empty={!vehicleType} />
                      <CargoStat icon={Box} label="Order value" value={formatMoney(order.price, order.currency)} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Order details unavailable.</p>
                )}
              </div>
            </section>

            {/* Customer */}
            <section className="p-5">
              <SectionHeader icon={Building2} title="Customer" />
              <div className="mt-4">
                {customer ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link to="/app/customers/$customerId" params={{ customerId: customer.id }}
                        className="text-base font-semibold hover:text-brand hover:underline">
                        {customer.companyName}
                      </Link>
                      {customer.contactName && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{customer.contactName}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {customer.phone && (
                        <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                          <a href={`tel:${customer.phone}`}><Phone className="mr-1 h-3 w-3" />{customer.phone}</a>
                        </Button>
                      )}
                      {customer.email && (
                        <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                          <a href={`mailto:${customer.email}`}><Mail className="mr-1 h-3 w-3" />Email</a>
                        </Button>
                      )}
                      {invoice && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          Invoice · {invoice.status.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm">{customerLabel}</p>
                )}
              </div>
            </section>

            {/* Financial */}
            {order && (
              <section className="p-5">
                <SectionHeader
                  icon={Wallet}
                  title="Financial"
                  action={
                    canViewInvoices ? (
                      <Link to="/app/finance"
                        search={invoice ? { tab: 'invoices' as const, invoiceId: invoice.id } : { tab: 'invoices' as const }}
                        className="text-[11px] font-medium text-brand hover:underline">
                        Finance
                      </Link>
                    ) : undefined
                  }
                />
                <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <MetricBadge label="Revenue" value={formatMoney(order.price, order.currency)} tone="brand" />
                  {canViewInvoices && (invoicesLoading ? (
                    <Skeleton className="h-[52px]" />
                  ) : invoicesError ? (
                    <Button size="sm" variant="outline" className="h-[52px]" onClick={() => refetchInvoices()}>Retry</Button>
                  ) : (
                    <MetricBadge label="Outstanding"
                      value={invoice ? formatMoney(outstanding!, invoice.currency) : '—'}
                      tone={outstanding && outstanding > 0 ? 'warn' : 'good'} />
                  ))}
                  {canViewExpenses && expenseTotal != null && (
                    <MetricBadge label="Expenses" value={formatMoney(expenseTotal, order.currency)} tone="muted" />
                  )}
                  {margin != null && (
                    <MetricBadge label="Margin" value={formatMoney(margin, order.currency)} tone={margin >= 0 ? 'good' : 'bad'} />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {canViewInvoices && !invoice && !invoicesLoading && dispatch.status === 'DELIVERED' && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={creatingInvoice}
                      onClick={async () => {
                        try { await createInvoiceFromOrder(order.id); toast.success('Invoice created'); }
                        catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
                      }}>
                      <Receipt className="mr-1 h-3 w-3" />
                      Create invoice
                    </Button>
                  )}
                  {canViewExpenses && !expensesQuery.isPending && (
                    <Badge variant="outline" className="text-[10px]">
                      {expenses.length > 0 ? `${expenses.length} expenses` : 'No expenses'}
                    </Badge>
                  )}
                </div>
              </section>
            )}

            {/* Notes */}
            <section className="p-5">
              <SectionHeader icon={StickyNote} title="Notes"
                action={canWrite ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSheet('notes')}>
                    <Edit2 className="mr-1 h-3 w-3" />Edit
                  </Button>
                ) : undefined}
              />
              <div className="mt-4">
                {dispatch.notes ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{dispatch.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No dispatcher notes yet.</p>
                )}
                {dispatch.deliveryNotes && (
                  <div className="mt-3 rounded-lg border border-border/50 bg-muted/15 px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery notes</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{dispatch.deliveryNotes}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Proof of Delivery */}
            <section className="p-5" id="proof-of-delivery">
              <SectionHeader icon={FileText} title="Proof of Delivery" />
              <div className="mt-4"><ProofOfDeliveryPanel dispatchId={dispatch.id} /></div>
            </section>

            {/* Timeline */}
            <section className="p-5" id="timeline">
              <SectionHeader icon={Clock} title="Timeline" />
              <div className="mt-4">
                {canViewAudit ? (
                  <DispatchOperationalTimeline
                    dispatch={dispatch}
                    invoice={canViewInvoices ? invoice : null}
                    resolveDriverName={resolveDriverName}
                    resolveVehiclePlate={resolveVehiclePlate}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Timeline requires audit access.</p>
                )}
              </div>
            </section>
          </div>

          {/* ─── Sticky sidebar ─── */}
          <aside className="bg-muted/10 lg:sticky lg:top-4 lg:self-start">
            <div className="divide-y divide-border/50 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">

              {/* Status Overview */}
              <div className="px-3.5 py-3">
                <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status Overview
                </h3>
                <dl className="space-y-2 text-xs">
                  <SidebarRow label="Dispatch"><StatusBadge status={dispatch.status} /></SidebarRow>
                  {driverStatus && <SidebarRow label="Driver"><StatusBadge status={driverStatus} /></SidebarRow>}
                  {vehicleStatus && <SidebarRow label="Vehicle"><StatusBadge status={vehicleStatus} /></SidebarRow>}
                  <SidebarRow label="GPS">
                    {liveVehicle ? (
                      <span className="inline-flex items-center gap-1 font-medium text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />Live
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No GPS</span>
                    )}
                  </SidebarRow>
                  {overdue && (
                    <SidebarRow label="Schedule">
                      <span className="font-medium text-destructive">Late</span>
                    </SidebarRow>
                  )}
                </dl>
              </div>

              {/* Conflicts */}
              <div className="px-3.5 py-3">
                <DispatchConflictPanel
                  dispatchId={dispatch.id}
                  role={role}
                  onSwapDriver={() => setSheet('reassign')}
                  onSwapVehicle={() => setSheet('reassign')}
                  onReschedule={() => openStatus(null)}
                />
              </div>

              {/* Quick Actions — lifecycle steps */}
              <div className="px-3.5 py-3">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick Actions
                </h3>
                <div className="space-y-0.5">
                  {DISPATCH_LIFECYCLE.map((step) => {
                    const stepRank = STATUS_RANK[step] ?? 0;
                    const isDone = stepRank < currentRank;
                    const isCurrent = step === dispatch.status;
                    const isNext = validNextStatuses.includes(step);
                    const label = LIFECYCLE_LABELS[step] ?? statusLabel(step);

                    if (isDone) {
                      return (
                        <div key={step} className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground/40">
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-success/50" />
                          {label}
                        </div>
                      );
                    }
                    if (isNext) {
                      return (
                        <button key={step} type="button"
                          className="flex h-8 w-full items-center gap-2 rounded-lg bg-gradient-brand px-2.5 text-left text-xs font-semibold text-brand-foreground hover:opacity-90"
                          onClick={() => openStatus(step)}>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          {NEXT_ACTION_LABEL[step] ?? label}
                        </button>
                      );
                    }
                    if (isCurrent) {
                      return (
                        <div key={step} className="flex h-7 items-center gap-2 rounded-lg bg-brand/10 px-2.5 text-xs font-semibold text-brand">
                          <Radio className="h-3 w-3 shrink-0" />
                          {label} — Now
                        </div>
                      );
                    }
                    return (
                      <div key={step} className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground/50">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/25" />
                        {label}
                      </div>
                    );
                  })}

                  <div className="my-1 border-t border-border/50" />

                  {canReassign && (
                    <SidebarBtn icon={Repeat} onClick={() => setSheet('reassign')}>Reassign crew</SidebarBtn>
                  )}
                  {canWrite && (
                    <SidebarBtn icon={StickyNote} onClick={() => setSheet('notes')}>Edit notes</SidebarBtn>
                  )}
                  {driverPhone && (
                    <a href={`tel:${driverPhone}`}
                      className="flex h-8 w-full items-center gap-2 px-2.5 text-xs font-medium text-foreground hover:bg-muted/30 rounded-lg">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      Call driver
                    </a>
                  )}
                  {canViewFleet && liveVehicle && (
                    <Link to="/app/fleet-tracking"
                      className="flex h-8 w-full items-center gap-2 px-2.5 text-xs font-medium text-foreground hover:bg-muted/30 rounded-lg">
                      <Navigation className="h-3.5 w-3.5 shrink-0" />
                      Track vehicle
                    </Link>
                  )}
                  <Link to="/app/orders/$orderId" params={{ orderId: dispatch.orderId }}
                    className="flex h-8 w-full items-center gap-2 px-2.5 text-xs font-medium text-foreground hover:bg-muted/30 rounded-lg">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    Open order
                  </Link>
                  {canViewInvoices && invoice && (
                    <SidebarBtn icon={Receipt} onClick={() => setInvoiceSheetId(invoice.id)}>View invoice</SidebarBtn>
                  )}
                  <SidebarBtn icon={RouteIcon} onClick={() => navigate({ to: '/app/dispatches/board' })}>
                    Dispatch board
                  </SidebarBtn>
                  {canCancel && (
                    <SidebarBtn icon={XCircle} onClick={() => setShowCancel(true)} destructive>
                      Cancel dispatch
                    </SidebarBtn>
                  )}
                </div>
              </div>

              {/* Documents */}
              {(driverLicenseExpiry || vehicleInsuranceExpiry || vehicleInspectionExpiry) && (
                <div className="px-3.5 py-3">
                  <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Documents
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    {driverLicenseExpiry && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Driver license</span>
                        <span className={cn('flex items-center gap-1 font-medium', licenseExpired ? 'text-destructive' : 'text-success')}>
                          <AlertTriangle className={cn('h-3 w-3', !licenseExpired && 'hidden')} />
                          <CheckCircle2 className={cn('h-3 w-3', licenseExpired && 'hidden')} />
                          {licenseExpired ? 'Expired' : 'Valid'}
                        </span>
                      </div>
                    )}
                    {vehicleInsuranceExpiry && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Insurance</span>
                        <span className={cn('flex items-center gap-1 font-medium', insuranceExpired ? 'text-destructive' : 'text-success')}>
                          <AlertTriangle className={cn('h-3 w-3', !insuranceExpired && 'hidden')} />
                          <CheckCircle2 className={cn('h-3 w-3', insuranceExpired && 'hidden')} />
                          {insuranceExpired ? 'Expired' : 'Valid'}
                        </span>
                      </div>
                    )}
                    {vehicleInspectionExpiry && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Inspection</span>
                        <span className={cn('flex items-center gap-1 font-medium', inspectionExpired ? 'text-destructive' : 'text-success')}>
                          <AlertTriangle className={cn('h-3 w-3', !inspectionExpired && 'hidden')} />
                          <CheckCircle2 className={cn('h-3 w-3', inspectionExpired && 'hidden')} />
                          {inspectionExpired ? 'Expired' : 'Valid'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div className="px-3.5 py-3">
                <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Schedule
                </h3>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Pickup</dt>
                    <dd className="font-medium tabular-nums">{formatDate(dispatch.pickupDateScheduled)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd className={cn('font-medium tabular-nums', overdue && 'text-destructive')}>
                      {formatDate(dispatch.deliveryDateScheduled)}
                    </dd>
                  </div>
                  {dispatch.pickupDateActual && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Picked up</dt>
                      <dd className="font-medium tabular-nums">{formatDateTime(dispatch.pickupDateActual)}</dd>
                    </div>
                  )}
                  {dispatch.deliveryDateActual && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Delivered</dt>
                      <dd className="font-medium tabular-nums">{formatDateTime(dispatch.deliveryDateActual)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Linked order */}
              {order && (
                <div className="px-3.5 py-3">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Linked Order
                  </h3>
                  <Link to="/app/orders/$orderId" params={{ orderId: order.id }}
                    className="font-mono text-sm font-semibold text-brand hover:underline">
                    {order.orderNumber}
                  </Link>
                  <div className="mt-1.5"><StatusBadge status={order.status} /></div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {canWrite && (
        <>
          <DispatchStatusSheet
            open={sheet === 'status'}
            onOpenChange={(open) => { if (!open) { setSheet(null); setStatusPreset(null); } }}
            dispatch={dispatch}
            initialStatus={statusPreset}
          />
          <DispatchNotesSheet
            open={sheet === 'notes'}
            onOpenChange={(open) => !open && setSheet(null)}
            dispatch={dispatch}
          />
          <DispatchReassignSheet
            open={sheet === 'reassign'}
            onOpenChange={(open) => !open && setSheet(null)}
            dispatch={dispatch}
          />
        </>
      )}
      {canViewInvoices && (
        <InvoiceDetailSheet
          invoiceId={invoiceSheetId}
          onOpenChange={(open) => { if (!open) setInvoiceSheetId(null); }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  action,
  destructive,
}: {
  icon: typeof User;
  title: string;
  action?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          destructive ? 'bg-destructive/10 text-destructive' : 'bg-brand/10 text-brand',
        )}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SidebarBtn({
  icon: Icon,
  children,
  onClick,
  destructive,
}: {
  icon: typeof Package;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium transition-colors hover:bg-muted/30',
        destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function CargoStat({
  icon: Icon,
  label,
  value,
  empty,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  empty?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className={cn('mt-1 text-sm font-semibold', empty && 'text-muted-foreground')}>{value}</p>
    </div>
  );
}

function MetricBadge({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'good' | 'warn' | 'bad' | 'muted';
}) {
  const toneClass = {
    brand: 'border-brand/20 bg-brand/5',
    good: 'border-success/20 bg-success/5',
    warn: 'border-warning/20 bg-warning/5',
    bad: 'border-destructive/20 bg-destructive/5',
    muted: 'border-border/60 bg-muted/30',
  }[tone];
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
