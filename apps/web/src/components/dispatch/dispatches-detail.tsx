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
import {
  DISPATCH_WRITE_ROLES,
  FLEET_ROLES,
  INVOICE_READ_ROLES,
  EXPENSE_READ_ROLES,
  AUDIT_ROLES,
} from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import type { DispatchStatus } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { formatMoney, formatDate, formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isDispatchOverdue } from '@/components/dispatch/dispatch-ops';
import { toast } from 'sonner';
import {
  AlertTriangle,
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
  EN_ROUTE_TO_PICKUP: 'Head to pickup',
  AT_PICKUP: 'Arrived at pickup',
  IN_TRANSIT: 'Mark picked up',
  DELIVERED: 'Mark delivered',
};

type SheetMode = 'status' | 'notes' | 'reassign' | null;

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

  const overdue = dispatch ? isDispatchOverdue(dispatch) : false;

  const expenseTotal = useMemo(() => {
    if (!order || expenses.length === 0) return null;
    let sum = 0;
    for (const e of expenses) {
      if (e.currency === order.currency) sum += Number(e.amount);
    }
    return Number.isFinite(sum) ? sum : null;
  }, [expenses, order]);

  const margin =
    order && expenseTotal != null ? Number(order.price) - expenseTotal : null;

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of driversList) {
      map.set(d.id, `${d.firstName} ${d.lastName}`.trim());
    }
    if (dispatch?.driver) {
      map.set(
        dispatch.driver.id,
        `${dispatch.driver.firstName} ${dispatch.driver.lastName}`.trim(),
      );
    }
    if (driver) {
      map.set(driver.id, `${driver.firstName} ${driver.lastName}`.trim());
    }
    return map;
  }, [driversList, dispatch?.driver, driver]);

  const vehiclePlateById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehiclesList) {
      map.set(v.id, v.plateNumber);
    }
    if (dispatch?.vehicle) {
      map.set(dispatch.vehicle.id, dispatch.vehicle.plateNumber);
    }
    if (vehicle) {
      map.set(vehicle.id, vehicle.plateNumber);
    }
    return map;
  }, [vehiclesList, dispatch?.vehicle, vehicle]);

  const resolveDriverName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—';
      return driverNameById.get(id) ?? 'Unknown driver';
    },
    [driverNameById],
  );

  const resolveVehiclePlate = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—';
      return vehiclePlateById.get(id) ?? 'Unknown vehicle';
    },
    [vehiclePlateById],
  );

  const outstanding = invoice
    ? Number(invoice.totalAmount) - Number(invoice.paidAmount ?? 0)
    : null;
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/dispatches' })}
          className="transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Dispatches
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
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
                {dispatch.dispatchNumber}
              </h1>
              <StatusBadge status={dispatch.status} />
              {overdue && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  Late
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
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
              {dispatch.driver && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  {dispatch.driver.firstName} {dispatch.driver.lastName}
                </span>
              )}
              {dispatch.vehicle && (
                <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                  <Truck className="h-3.5 w-3.5" />
                  {dispatch.vehicle.plateNumber}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {primaryNext && (
              <Button
                size="sm"
                className={
                  primaryNext === 'DELIVERED' || primaryNext === 'IN_TRANSIT'
                    ? 'bg-gradient-brand text-brand-foreground hover:opacity-90'
                    : undefined
                }
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
            {dispatch.driver?.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${dispatch.driver.phone}`}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  Call
                </a>
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

        {/* Mission timeline */}
        <div className="border-b border-border/60 px-5 py-4">
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

        {/* Body: work surface | sticky rail */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20%)]">
          <div className="divide-y divide-border/50 lg:border-r lg:border-border/50">
            {/* Live route: Pickup / Transit / Delivery */}
            <div className="grid grid-cols-1 md:grid-cols-3">
              <div className="space-y-2.5 border-b border-border/50 p-5 md:border-b-0 md:border-r md:border-border/50">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-brand">
                  <MapPin className="h-3.5 w-3.5" />
                  Pickup
                </div>
                <p className="text-lg font-semibold tracking-tight text-foreground">
                  {order?.pickupCity ?? dispatch.order?.pickupCity ?? '—'}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {order?.pickupAddress ?? 'Address on order'}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Planned </span>
                    <span className="font-medium tabular-nums">
                      {formatDate(dispatch.pickupDateScheduled)}
                    </span>
                  </span>
                  {dispatch.pickupDateActual && (
                    <span>
                      <span className="text-muted-foreground">Actual </span>
                      <span className="font-medium tabular-nums text-success">
                        {formatDateTime(dispatch.pickupDateActual)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2.5 border-b border-border/50 p-5 md:border-b-0 md:border-r md:border-border/50">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <RouteIcon className="h-3.5 w-3.5" />
                  Transit
                </div>
                <p className="text-lg font-semibold capitalize tracking-tight text-foreground">
                  {statusLabel(dispatch.status)}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {dispatch.status === 'IN_TRANSIT'
                    ? 'Cargo is on the road'
                    : dispatch.status === 'DELIVERED'
                      ? 'Trip complete'
                      : dispatch.status === 'CANCELLED'
                        ? 'Trip cancelled'
                        : 'Not yet in transit'}
                </p>
                {liveVehicle && (
                  <p className="inline-flex items-center gap-1.5 pt-1 text-xs capitalize text-brand">
                    <Radio className="h-3 w-3" />
                    {liveVehicle.movementState.toLowerCase()}
                    {liveVehicle.speedKph != null && (
                      <span className="tabular-nums text-muted-foreground">
                        · {Math.round(liveVehicle.speedKph)} km/h
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2.5 p-5">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-success">
                  <MapPin className="h-3.5 w-3.5" />
                  Delivery
                  {overdue && (
                    <Badge variant="destructive" className="ml-auto h-5 gap-1 px-1.5 text-[10px]">
                      <AlertTriangle className="h-3 w-3" />
                      Late
                    </Badge>
                  )}
                </div>
                <p className="text-lg font-semibold tracking-tight text-foreground">
                  {order?.deliveryCity ?? dispatch.order?.deliveryCity ?? '—'}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {order?.deliveryAddress ?? 'Address on order'}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Planned </span>
                    <span className={cn('font-medium tabular-nums', overdue && 'text-destructive')}>
                      {formatDate(dispatch.deliveryDateScheduled)}
                    </span>
                  </span>
                  {dispatch.deliveryDateActual && (
                    <span>
                      <span className="text-muted-foreground">Actual </span>
                      <span className="font-medium tabular-nums">
                        {formatDateTime(dispatch.deliveryDateActual)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Assignment */}
            <section className="p-5">
              <SectionHeader
                icon={User}
                title="Assignment"
                action={
                  canReassign ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSheet('reassign')}
                    >
                      <Edit2 className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  ) : undefined
                }
              />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InfoTile
                  label="Driver"
                  value={
                    dispatch.driver
                      ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}`
                      : '—'
                  }
                  meta={dispatch.driver?.employeeCode ?? driver?.employeeCode ?? '—'}
                  footer={
                    dispatch.driver?.phone ? (
                      <a
                        href={`tel:${dispatch.driver.phone}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {dispatch.driver.phone}
                      </a>
                    ) : null
                  }
                  link={
                    canViewFleet && dispatch.driverId
                      ? { to: '/app/drivers/$driverId', params: { driverId: dispatch.driverId } }
                      : null
                  }
                />
                <InfoTile
                  label="Vehicle"
                  value={dispatch.vehicle?.plateNumber ?? '—'}
                  mono
                  meta={`${dispatch.vehicle?.type ?? vehicle?.type ?? '—'}${
                    dispatch.vehicle?.vehicleCode ? ` · ${dispatch.vehicle.vehicleCode}` : ''
                  }`}
                  badge={dispatch.vehicle ? <StatusBadge status={dispatch.vehicle.status} /> : null}
                  link={
                    canViewFleet && dispatch.vehicleId
                      ? { to: '/app/vehicles/$vehicleId', params: { vehicleId: dispatch.vehicleId } }
                      : null
                  }
                />
                <InfoTile
                  label="Dispatcher"
                  value={
                    dispatch.createdBy
                      ? `${dispatch.createdBy.firstName} ${dispatch.createdBy.lastName}`
                      : '—'
                  }
                  meta={dispatch.createdBy?.email ?? 'Created without actor on file'}
                  footer={
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(dispatch.createdAt)}
                    </span>
                  }
                />
              </div>
            </section>

            {/* Shipment */}
            <section className="p-5">
              <SectionHeader icon={Package} title="Shipment" />
              <div className="mt-3">
                {orderLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : order ? (
                  <>
                    <p className="mb-4 text-sm leading-relaxed text-foreground">
                      {order.cargoDescription}
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                      <CargoStat
                        icon={Scale}
                        label="Weight"
                        value={order.cargoWeightKg ? `${order.cargoWeightKg} kg` : 'Not set'}
                        empty={!order.cargoWeightKg}
                      />
                      <CargoStat
                        icon={Ruler}
                        label="Volume"
                        value={order.cargoVolumeM3 ? `${order.cargoVolumeM3} m³` : 'Not set'}
                        empty={!order.cargoVolumeM3}
                      />
                      <CargoStat
                        icon={Truck}
                        label="Vehicle type"
                        value={
                          dispatch.vehicle
                            ? dispatch.vehicle.type.toLowerCase().replace(/_/g, ' ')
                            : 'Unassigned'
                        }
                        empty={!dispatch.vehicle}
                      />
                      <CargoStat
                        icon={Box}
                        label="Order value"
                        value={formatMoney(order.price, order.currency)}
                      />
                    </div>
                    {(dispatch.deliveryProofCount ?? 0) > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        <FileText className="mr-1 inline h-3 w-3" />
                        {dispatch.deliveryProofCount} delivery proof
                        {dispatch.deliveryProofCount === 1 ? '' : 's'} on file
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Order details unavailable.</p>
                )}
              </div>
            </section>

            {/* Customer */}
            <section className="p-5">
              <SectionHeader icon={Building2} title="Customer" />
              <div className="mt-3">
                {customer ? (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        to="/app/customers/$customerId"
                        params={{ customerId: customer.id }}
                        className="text-base font-semibold text-foreground hover:text-brand hover:underline"
                      >
                        {customer.companyName}
                      </Link>
                      {customer.contactName && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{customer.contactName}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {customer.phone && (
                        <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                          <a href={`tel:${customer.phone}`}>
                            <Phone className="mr-1 h-3 w-3" />
                            {customer.phone}
                          </a>
                        </Button>
                      )}
                      {customer.email && (
                        <Button asChild size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                          <a href={`mailto:${customer.email}`}>
                            <Mail className="mr-1 h-3 w-3" />
                            Email
                          </a>
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
                  <p className="text-sm text-foreground">{customerLabel}</p>
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
                      <Link
                        to="/app/finance"
                        search={
                          invoice
                            ? { tab: 'invoices' as const, invoiceId: invoice.id }
                            : { tab: 'invoices' as const }
                        }
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        Finance
                      </Link>
                    ) : undefined
                  }
                />
                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <MetricBadge label="Revenue" value={formatMoney(order.price, order.currency)} tone="brand" />
                  {canViewInvoices &&
                    (invoicesLoading ? (
                      <Skeleton className="h-[56px] w-full" />
                    ) : invoicesError ? (
                      <Button size="sm" variant="outline" className="h-[56px]" onClick={() => refetchInvoices()}>
                        Retry
                      </Button>
                    ) : (
                      <MetricBadge
                        label="Outstanding"
                        value={invoice ? formatMoney(outstanding!, invoice.currency) : '—'}
                        tone={outstanding && outstanding > 0 ? 'warn' : 'good'}
                      />
                    ))}
                  {canViewExpenses && expenseTotal != null && (
                    <MetricBadge
                      label="Expenses"
                      value={formatMoney(expenseTotal, order.currency)}
                      tone="muted"
                    />
                  )}
                  {margin != null && (
                    <MetricBadge
                      label="Margin"
                      value={formatMoney(margin, order.currency)}
                      tone={margin >= 0 ? 'good' : 'bad'}
                    />
                  )}
                  {canViewInvoices && invoice && collected != null && (
                    <MetricBadge
                      label="Collected"
                      value={formatMoney(collected, invoice.currency)}
                      tone="good"
                    />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {canViewInvoices && !invoice && !invoicesLoading && dispatch.status === 'DELIVERED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={creatingInvoice}
                      onClick={async () => {
                        try {
                          await createInvoiceFromOrder(order.id);
                          toast.success('Invoice created');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Failed');
                        }
                      }}
                    >
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
              <SectionHeader
                icon={StickyNote}
                title="Notes"
                action={
                  canWrite ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSheet('notes')}
                    >
                      <Edit2 className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  ) : undefined
                }
              />
              <div className="mt-3">
                {dispatch.notes ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {dispatch.notes}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No dispatcher notes yet.</p>
                )}
                {dispatch.deliveryNotes && (
                  <div className="mt-4 rounded-lg border border-border/50 bg-muted/15 px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Delivery notes
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                      {dispatch.deliveryNotes}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Operational timeline */}
            <section className="p-5" id="timeline">
              <SectionHeader icon={Clock} title="Timeline" />
              <div className="mt-3">
                {canViewAudit ? (
                  <DispatchOperationalTimeline
                    dispatch={dispatch}
                    invoice={canViewInvoices ? invoice : null}
                    resolveDriverName={resolveDriverName}
                    resolveVehiclePlate={resolveVehiclePlate}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Timeline requires audit access.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Sticky ops rail */}
          <aside className="bg-muted/10 lg:sticky lg:top-4 lg:self-start">
            <div className="divide-y divide-border/50 p-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div className="space-y-2 pb-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Operations
                </h3>
                <div className="flex flex-col gap-1.5">
                  {validNextStatuses.length > 0 && (
                    <Button
                      size="sm"
                      className="h-9 justify-start"
                      onClick={() => openStatus(primaryNext)}
                    >
                      <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                      {primaryNext
                        ? NEXT_ACTION_LABEL[primaryNext] ?? statusLabel(primaryNext)
                        : 'Update status'}
                    </Button>
                  )}
                  {canReassign && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 justify-start"
                      onClick={() => setSheet('reassign')}
                    >
                      <Repeat className="mr-2 h-3.5 w-3.5" />
                      Reassign crew
                    </Button>
                  )}
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 justify-start"
                      onClick={() => setSheet('notes')}
                    >
                      <StickyNote className="mr-2 h-3.5 w-3.5" />
                      Edit notes
                    </Button>
                  )}
                  {dispatch.driver?.phone && (
                    <Button asChild size="sm" variant="outline" className="h-9 justify-start">
                      <a href={`tel:${dispatch.driver.phone}`}>
                        <Phone className="mr-2 h-3.5 w-3.5" />
                        Call driver
                      </a>
                    </Button>
                  )}
                  {canViewFleet && dispatch.vehicleId && liveVehicle && (
                    <Button asChild size="sm" variant="outline" className="h-9 justify-start">
                      <Link to="/app/fleet-tracking">
                        <Navigation className="mr-2 h-3.5 w-3.5" />
                        Track vehicle
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline" className="h-9 justify-start">
                    <Link to="/app/orders/$orderId" params={{ orderId: dispatch.orderId }}>
                      <Package className="mr-2 h-3.5 w-3.5" />
                      Open order
                    </Link>
                  </Button>
                  {canViewInvoices && invoice && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 justify-start"
                      onClick={() => setInvoiceSheetId(invoice.id)}
                    >
                      <Receipt className="mr-2 h-3.5 w-3.5" />
                      Invoice
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 justify-start"
                    onClick={() => navigate({ to: '/app/dispatches/board' })}
                  >
                    <RouteIcon className="mr-2 h-3.5 w-3.5" />
                    Dispatch board
                  </Button>
                </div>
              </div>

              {canViewFleet && dispatch.vehicleId && liveVehicle && (
                <div className="py-4">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Live tracking
                  </h3>
                  <p className="inline-flex items-center gap-1.5 text-sm capitalize">
                    <Radio className="h-3.5 w-3.5 text-brand" />
                    <span className="font-medium">{liveVehicle.movementState.toLowerCase()}</span>
                    {liveVehicle.speedKph != null && (
                      <span className="tabular-nums text-muted-foreground">
                        · {Math.round(liveVehicle.speedKph)} km/h
                      </span>
                    )}
                  </p>
                  {liveVehicle.lastReceivedAt && (
                    <p className={cn('mt-1 text-xs', liveVehicle.isStale && 'text-warning')}>
                      GPS {formatRelativeTime(liveVehicle.lastReceivedAt)}
                    </p>
                  )}
                </div>
              )}

              <div className="py-4">
                <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Schedule
                </h3>
                <dl className="space-y-2 text-sm">
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

              {order && (
                <div className="py-4">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Linked order
                  </h3>
                  <Link
                    to="/app/orders/$orderId"
                    params={{ orderId: order.id }}
                    className="font-mono text-sm font-semibold text-brand hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <div className="mt-1.5">
                    <StatusBadge status={order.status} />
                  </div>
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
            onOpenChange={(open) => {
              if (!open) {
                setSheet(null);
                setStatusPreset(null);
              }
            }}
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
          onOpenChange={(open) => {
            if (!open) setInvoiceSheetId(null);
          }}
        />
      )}
    </div>
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

function InfoTile({
  label,
  value,
  meta,
  mono,
  badge,
  footer,
  link,
}: {
  label: string;
  value: string;
  meta?: string;
  mono?: boolean;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  link?: { to: string; params: Record<string, string> } | null;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 text-sm font-semibold text-foreground', mono && 'font-mono')}>{value}</p>
      {meta && <p className="mt-0.5 truncate text-[11px] capitalize text-muted-foreground">{meta}</p>}
      {badge && <div className="mt-2">{badge}</div>}
      {footer && <div className="mt-2">{footer}</div>}
      {link && (
        <Link
          to={link.to}
          params={link.params}
          className="mt-2 block text-[11px] text-muted-foreground hover:text-brand"
        >
          Profile →
        </Link>
      )}
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
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'good' | 'warn' | 'bad' | 'muted';
}) {
  const toneClass = {
    brand: 'border-brand/20 bg-brand/5 text-foreground',
    good: 'border-success/20 bg-success/5 text-foreground',
    warn: 'border-warning/20 bg-warning/5 text-foreground',
    bad: 'border-destructive/20 bg-destructive/5 text-foreground',
    muted: 'border-border/60 bg-muted/30 text-foreground',
  }[tone];
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
