'use client';

import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { auditLogKeys } from '@/lib/api/query-keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AssignModal, type AssignTab } from '@/components/orders/assign-modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge, statusLabel } from '@/components/shared/status-badge';

/// What each order transition is called to the person doing it. "Move to
/// PENDING" is the database's name for confirming a draft, and it was the only
/// way to make a new order dispatchable — the Orders list called the same step
/// "Activate draft", so the product had two names for it and neither was the
/// one an operator would use.
const TRANSITION_LABELS: Partial<Record<OrderStatus, string>> = {
  PENDING: 'Confirm order',
  ASSIGNED: 'Mark as assigned',
  IN_TRANSIT: 'Mark in transit',
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
import { OrderTimeline } from '@/components/orders/order-timeline';
import {
  OrderActivityTimeline,
  buildOrderActivityTimeline,
} from '@/components/orders/order-activity-timeline';
import { OrderDocumentsPanel } from '@/components/orders/order-documents-panel';
import { OrderNotesPanel } from '@/components/orders/order-notes-panel';
import { ProofOfDeliveryPanel } from '@/components/dispatch/proof-of-delivery-panel';
import {
  driverFromDispatch,
  hasEffectiveAssignment,
  resolveEffectiveAssignment,
  vehicleFromDispatch,
} from '@/components/orders/order-assignment.util';
import { OrdersEditSheet } from '@/components/orders/orders-edit-sheet';
import { OrderRouteMap } from '@/components/orders/order-route-map';
import { InvoiceDetailSheet } from '@/components/finance/invoice-detail-sheet';
import {
  useOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  useArchiveOrder,
  useRestoreOrder,
  type OrderStatus,
} from '@/lib/api/orders';
import { auditLogsAPI } from '@/lib/api/audit-logs';
import { useDriver, type Driver } from '@/lib/api/drivers';
import { useVehicle, type Vehicle } from '@/lib/api/vehicles';
import { useCustomerDetail } from '@/lib/api/customers';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useInvoicesQuery, useCreateInvoiceFromOrderMutation } from '@/lib/api/invoices';
import { useExpensesQuery, type Expense } from '@/lib/api/expenses';
import { useLiveFleetQuery } from '@/lib/api/telematics';
import { useCurrentUser } from '@/lib/api/auth';
import {
  INVOICE_READ_ROLES,
  FLEET_ROLES,
  DISPATCH_ROLES,
  DISPATCH_WRITE_ROLES,
  ORDER_WRITE_ROLES,
  ORDER_OPERATIONAL_ROLES,
  EXPENSE_READ_ROLES,
  AUDIT_ROLES,
} from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import type { ApiDispatch } from '@/lib/api/dispatches';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  FileText,
  Mail,
  MapPin,
  Navigation,
  Package,
  Phone,
  Radio,
  Receipt,
  Route as RouteIcon,
  Ruler,
  Scale,
  Truck,
  User,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { formatMoney, formatDate, formatRelativeTime, formatStopTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

interface OrderDetailProps {
  orderId: string;
}

function Avatar({
  initials,
  tone = 'brand',
}: {
  initials: string;
  tone?: 'brand' | 'success' | 'muted';
}) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        tone === 'brand' && 'bg-brand/15 text-brand',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {initials || '?'}
    </span>
  );
}

function MetricBadge({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'brand';
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2',
        tone === 'default' && 'border-border/70 bg-background/40',
        tone === 'good' && 'border-success/25 bg-success/[0.07]',
        tone === 'warn' && 'border-warning/25 bg-warning/[0.07]',
        tone === 'bad' && 'border-destructive/25 bg-destructive/[0.07]',
        tone === 'brand' && 'border-brand/25 bg-brand/[0.07]',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-sm font-semibold tabular-nums',
          tone === 'good' && 'text-success',
          tone === 'warn' && 'text-warning',
          tone === 'bad' && 'text-destructive',
          tone === 'brand' && 'text-brand',
          tone === 'default' && 'text-foreground',
        )}
      >
        {value}
      </p>
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
    <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          empty ? 'bg-muted text-muted-foreground' : 'bg-brand/10 text-brand',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 text-sm font-semibold', empty ? 'text-muted-foreground' : 'text-foreground')}>
          {value}
        </p>
      </div>
    </div>
  );
}

function licenseLabel(expiry: string | null | undefined): { text: string; bad: boolean } | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: 'Expired', bad: true };
  if (days <= 30) return { text: `${days}d left`, bad: true };
  return { text: formatDate(expiry), bad: false };
}

export function OrdersDetail({ orderId }: OrderDetailProps) {
  const navigate = useNavigate();
  const activityRef = useRef<HTMLElement>(null);
  const { data: order, loading, error, refetch } = useOrder(orderId);
  const { updateStatus, loading: statusLoading } = useUpdateOrderStatus();
  const { cancel, loading: cancelLoading } = useCancelOrder();
  const { archive, loading: archiveLoading } = useArchiveOrder();
  const { restore, loading: restoreLoading } = useRestoreOrder();

  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canViewInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));
  const canViewFleet = Boolean(role && FLEET_ROLES.includes(role));
  const canViewDispatch = Boolean(role && DISPATCH_ROLES.includes(role));
  const canWriteDispatch = Boolean(role && DISPATCH_WRITE_ROLES.includes(role));
  const canWriteOrder = Boolean(role && ORDER_WRITE_ROLES.includes(role));
  const canOperateOrder = Boolean(role && ORDER_OPERATIONAL_ROLES.includes(role));
  const canViewExpenses = Boolean(role && EXPENSE_READ_ROLES.includes(role));
  const canViewAudit = Boolean(role && AUDIT_ROLES.includes(role));

  const auditQuery = useQuery({
    queryKey: auditLogKeys.list({ entityType: 'Order', entityId: orderId }),
    queryFn: () =>
      auditLogsAPI.list({
        entityType: 'Order',
        entityId: orderId,
        limit: 100,
        sortOrder: 'desc',
      }),
    enabled: canViewAudit && Boolean(orderId),
  });

  const { data: dispatchesForOrder, loading: dispatchesLoading } = useDispatches(
    1,
    5,
    { orderId },
    { enabled: canViewDispatch },
  );
  const dispatch: ApiDispatch | null = dispatchesForOrder?.[0] ?? null;

  const { data: invoicesForOrder, isPending: invoicesLoading, isError: invoicesError, refetch: refetchInvoices } =
    useInvoicesQuery({ orderId, limit: 1 }, canViewInvoices);
  const invoice = invoicesForOrder?.items[0] ?? null;
  const { mutateAsync: createInvoiceFromOrder, isPending: creatingInvoice } = useCreateInvoiceFromOrderMutation();

  const expensesQuery = useExpensesQuery(
    { orderId, limit: 50 },
    { enabled: canViewExpenses && Boolean(orderId) },
  );
  const expenses: Expense[] = expensesQuery.data?.items ?? [];

  const plannedDriverId =
    order?.driverId ?? (dispatch?.status === 'DRAFT' ? dispatch?.driverId ?? null : null);
  const plannedVehicleId =
    order?.vehicleId ?? (dispatch?.status === 'DRAFT' ? dispatch?.vehicleId ?? null : null);

  const liveFleet = useLiveFleetQuery({
    enabled: canViewFleet && Boolean(plannedVehicleId),
    refetchInterval: plannedVehicleId ? 30_000 : undefined,
  });
  const liveVehicle = useMemo(() => {
    if (!plannedVehicleId || !liveFleet.data) return null;
    return liveFleet.data.find((v) => v.vehicleId === plannedVehicleId) ?? null;
  }, [liveFleet.data, plannedVehicleId]);

  const [editOpen, setEditOpen] = useState(false);
  const [invoiceSheetId, setInvoiceSheetId] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<{ open: boolean; tab: AssignTab }>({ open: false, tab: 'both' });
  const [showCancel, setShowCancel] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [pendingConfirmOrder, setPendingConfirmOrder] = useState(false);
  const [pendingDeliverConfirm, setPendingDeliverConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [highlightStatus, setHighlightStatus] = useState<OrderStatus | null>(null);

  const { data: customer, loading: customerLoading } = useCustomerDetail(order?.customerId ?? '');
  const { data: assignedDriver } = useDriver(
    canViewFleet && plannedDriverId ? plannedDriverId : '',
  );
  const { data: assignedVehicle } = useVehicle(
    canViewFleet && plannedVehicleId ? plannedVehicleId : '',
  );

  if (loading) return <LoadingState label="Loading order..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!order) {
    return (
      <EmptyState
        icon={Package}
        title="Order not found"
        description="This order may have been deleted, or the link is incorrect."
        action={
          <Button onClick={() => navigate({ to: '/app/orders' })} variant="outline">
            Back to Orders
          </Button>
        }
      />
    );
  }

  const { driverId: effectiveDriverId, vehicleId: effectiveVehicleId, isDraftPlan } =
    resolveEffectiveAssignment(order, dispatch);
  const displayDriver =
    assignedDriver ?? driverFromDispatch(dispatch) ?? (effectiveDriverId && !canViewFleet ? { id: effectiveDriverId } as Driver : null);
  const displayVehicle =
    assignedVehicle ?? vehicleFromDispatch(dispatch) ?? (effectiveVehicleId && !canViewFleet ? { id: effectiveVehicleId } as Vehicle : null);

  const allowedTransitions = order.allowedTransitions.filter(
    (status) => status !== 'ASSIGNED' || hasEffectiveAssignment(order, dispatch),
  );
  const canEdit = canWriteOrder && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && !order.archivedAt;
  const canAssign = canOperateOrder && ['PENDING', 'ASSIGNED'].includes(order.status) && !order.archivedAt;
  const canCancel = canOperateOrder && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && !order.archivedAt;
  const canAdvanceStatus = canOperateOrder && allowedTransitions.length > 0 && !order.archivedAt;
  const canArchive =
    canOperateOrder &&
    !order.archivedAt &&
    (order.status === 'DELIVERED' || order.status === 'CANCELLED');
  const canRestore = canOperateOrder && Boolean(order.archivedAt);

  const customerLabel = customerLoading ? '…' : customer?.companyName ?? '—';
  const activityEntries = buildOrderActivityTimeline(
    order,
    auditQuery.data?.items ?? [],
    invoice,
  );

  const approvedExpenseTotal = expenses
    .filter((e) => e.status === 'APPROVED')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const pendingExpenseCount = expenses.filter((e) => e.status === 'PENDING').length;
  const revenue = Number(order.price);
  const hasExpenseData = canViewExpenses && !expensesQuery.isPending;
  const margin =
    hasExpenseData && Number.isFinite(revenue) ? revenue - approvedExpenseTotal : null;
  const outstanding = invoice ? Number(invoice.balanceDue) : null;
  const collected = invoice ? Number(invoice.paidAmount) : null;

  const handleStatusTransition = async (newStatus: OrderStatus) => {
    try {
      await updateStatus(orderId, { status: newStatus });
      toast.success(`Moved to ${newStatus.replace(/_/g, ' ')}`);
    } catch (err) {
      toast.error(describeError(err, 'Failed'));
    }
  };

  const handleCancel = async () => {
    try {
      await cancel(orderId, { note: cancelNote });
      toast.success('Order cancelled');
      setShowCancel(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed'));
    }
  };

  const handleArchive = async () => {
    try {
      await archive(orderId);
      toast.success('Order archived');
      setShowArchiveConfirm(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive'));
    }
  };

  const handleRestore = async () => {
    try {
      await restore(orderId);
      toast.success('Order restored');
      setShowRestoreConfirm(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore'));
    }
  };

  const jumpToActivity = (status: OrderStatus) => {
    setHighlightStatus(status);
    activityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setHighlightStatus(null), 2500);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-2 pb-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate({ to: '/app/orders', search: {} })}
          className="transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Orders
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{order.orderNumber}</span>
      </div>

      {/* ===== ONE workspace shell — not a stack of disconnected cards ===== */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {/* Header band */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
                {order.orderNumber}
              </h1>
              <StatusBadge status={order.status} />
              {order.isDelayed && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-3 w-3" />
                  Delayed
                </Badge>
              )}
              {order.archivedAt && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Archive className="h-3 w-3" />
                  Archived
                </Badge>
              )}
              {order.status === 'PENDING' && !hasEffectiveAssignment(order, dispatch) && (
                <Badge className="bg-warning/15 text-[10px] text-warning hover:bg-warning/15">
                  Needs assignment
                </Badge>
              )}
              {dispatch?.status === 'DELIVERY_FAILED' && (
                <Badge className="gap-1 bg-destructive/15 text-[10px] text-destructive hover:bg-destructive/15">
                  <XCircle className="h-3 w-3" />
                  Previous delivery failed
                  {dispatch.failureReason && (
                    <span className="opacity-75">
                      · {FAILURE_REASON_LABELS[dispatch.failureReason] ?? dispatch.failureReason}
                    </span>
                  )}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                {order.pickupCity}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {order.deliveryCity}
              </span>
              <Link
                to="/app/customers/$customerId"
                params={{ customerId: order.customerId }}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand hover:underline"
              >
                <Building2 className="h-3.5 w-3.5" />
                {customerLabel}
              </Link>
              <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                {formatMoney(order.price, order.currency)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canAssign && (
              <Button size="sm" onClick={() => setAssignModal({ open: true, tab: 'both' })} data-testid="orders-assign-toggle">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                {hasEffectiveAssignment(order, dispatch) ? 'Reassign' : 'Assign'}
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            {canViewInvoices && !invoice && order.status === 'DELIVERED' && (
              <Button
                size="sm"
                variant="outline"
                disabled={creatingInvoice || invoicesLoading}
                onClick={async () => {
                  try {
                    await createInvoiceFromOrder(orderId);
                    toast.success('Invoice created');
                  } catch (err) {
                    toast.error(describeError(err, 'Failed'));
                  }
                }}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                Invoice
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
                    disabled={cancelLoading}
                  >
                    Cancel
                  </Button>
                }
                title={`Cancel ${order.orderNumber}?`}
                description="Every open dispatch for this order is cancelled too, releasing its driver and vehicle. The order stays on record but cannot be reopened or edited."
                confirmLabel={cancelLoading ? 'Cancelling…' : 'Cancel order'}
                cancelLabel="Keep"
                onConfirm={handleCancel}
                destructive
              >
                <Textarea
                  placeholder="Reason (optional)"
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </ConfirmDialog>
            )}
            {canArchive && (
              <ConfirmDialog
                open={showArchiveConfirm}
                onOpenChange={setShowArchiveConfirm}
                trigger={
                  <Button size="sm" variant="outline" disabled={archiveLoading}>
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                    Archive
                  </Button>
                }
                title={`Archive ${order.orderNumber}?`}
                description="Archived orders are hidden from the default list but can be restored later."
                confirmLabel={archiveLoading ? 'Archiving…' : 'Archive order'}
                onConfirm={handleArchive}
              />
            )}
            {canRestore && (
              <ConfirmDialog
                open={showRestoreConfirm}
                onOpenChange={setShowRestoreConfirm}
                trigger={
                  <Button size="sm" variant="outline" disabled={restoreLoading}>
                    <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                }
                title={`Restore ${order.orderNumber}?`}
                description="This order will reappear in the active orders list."
                confirmLabel={restoreLoading ? 'Restoring…' : 'Restore order'}
                onConfirm={handleRestore}
              />
            )}
          </div>
        </div>

        {/* Mission timeline — dense, with live context chips */}
        <div className="border-b border-border/70 px-4 py-3">
          <OrderTimeline
            order={order}
            driver={displayDriver}
            vehicle={displayVehicle}
            dispatch={dispatch}
            live={liveVehicle}
            onStageClick={jumpToActivity}
          />
        </div>

        {/* Body: work surface | ops rail — shared shell, section dividers only */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* -------- LEFT WORK SURFACE -------- */}
          <div className="">
            {/* Route — Map(2fr) + Pickup(1fr) + Delivery(1fr)
                Mobile: stacked column; Desktop: 4-col grid [2fr 1fr auto 1fr] */}
            <div className="px-4 pt-4 grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_auto_1fr]">
              {/* Map */}
              <div className="relative min-h-[230px] overflow-hidden rounded-lg border border-border/70">
                <OrderRouteMap
                  pickupCity={order.pickupCity}
                  pickupCountryCode={order.pickupCountryCode}
                  pickupLat={order.pickupLat}
                  pickupLng={order.pickupLng}
                  deliveryCity={order.deliveryCity}
                  deliveryCountryCode={order.deliveryCountryCode}
                  deliveryLat={order.deliveryLat}
                  deliveryLng={order.deliveryLng}
                  vehicleId={order.vehicleId}
                  className="absolute inset-0"
                />
              </div>

                {/* Pickup */}
                <div className="min-w-0 space-y-3 rounded-lg border border-border/70 p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    Pickup
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{order.pickupCity}</p>
                    {order.pickupAddress && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{order.pickupAddress}</p>
                    )}
                    {(order.pickupPostalCode || order.pickupCountryCode) && (
                      <p className="text-[11px] text-muted-foreground">
                        {[order.pickupCity, order.pickupPostalCode, order.pickupCountryCode]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="tabular-nums font-medium">{formatDate(order.pickupDate)}</span>
                    </div>
                    {dispatch?.pickupDateActual && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Actual:</span>
                        <span className="tabular-nums font-medium text-foreground">
                          {formatDate(dispatch.pickupDateActual)}
                        </span>
                      </div>
                    )}
                    {order.pickupWindowStart && order.pickupWindowEnd && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="tabular-nums">
                          {formatStopTime(order.pickupWindowStart)} –{' '}
                          {formatStopTime(order.pickupWindowEnd)}
                        </span>
                      </div>
                    )}
                    {(order.pickupContactName ||
                      (customer?.contactName && !order.pickupContactName)) && (
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{order.pickupContactName ?? customer?.contactName}</span>
                      </div>
                    )}
                    {(order.pickupContactPhone || customer?.phone) && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <a
                          href={`tel:${order.pickupContactPhone ?? customer?.phone}`}
                          className="truncate text-brand hover:underline"
                        >
                          {order.pickupContactPhone ?? customer?.phone}
                        </a>
                      </div>
                    )}
                    {order.pickupInstructions && (
                      <p className="text-[11px] italic text-muted-foreground">
                        {order.pickupInstructions}
                      </p>
                    )}
                  </div>
                </div>

              {/* Arrow — visible only on desktop between the two cards */}
              <div className="hidden md:flex md:items-center md:justify-center">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Delivery */}
              <div className="min-w-0 space-y-3 rounded-lg border border-border/70 p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    Delivery
                    {order.isDelayed && (
                      <Badge variant="destructive" className="ml-auto h-5 gap-1 px-1.5 text-[10px]">
                        <AlertTriangle className="h-3 w-3" />
                        Delayed
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{order.deliveryCity}</p>
                    {order.deliveryAddress && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{order.deliveryAddress}</p>
                    )}
                    {(order.deliveryPostalCode || order.deliveryCountryCode) && (
                      <p className="text-[11px] text-muted-foreground">
                        {[order.deliveryCity, order.deliveryPostalCode, order.deliveryCountryCode]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span
                        className={cn(
                          'tabular-nums font-medium',
                          order.isDelayed && 'text-destructive',
                        )}
                      >
                        {formatDate(order.deliveryDate)}
                      </span>
                    </div>
                    {(dispatch?.deliveryDateActual || order.deliveredAt) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Actual:</span>
                        <span className="tabular-nums font-medium text-foreground">
                          {formatDate(dispatch?.deliveryDateActual || order.deliveredAt!)}
                        </span>
                      </div>
                    )}
                    {order.deliveryWindowStart && order.deliveryWindowEnd && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="tabular-nums">
                          {formatStopTime(order.deliveryWindowStart)} –{' '}
                          {formatStopTime(order.deliveryWindowEnd)}
                        </span>
                      </div>
                    )}
                    {order.deliveryContactName && (
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{order.deliveryContactName}</span>
                      </div>
                    )}
                    {order.deliveryContactPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <a
                          href={`tel:${order.deliveryContactPhone}`}
                          className="truncate text-brand hover:underline"
                        >
                          {order.deliveryContactPhone}
                        </a>
                      </div>
                    )}
                    {order.deliveryInstructions && (
                      <p className="text-[11px] italic text-muted-foreground">
                        {order.deliveryInstructions}
                      </p>
                    )}
                  </div>
              </div>
            </div>

            {/* Intermediate stops */}
            {order.orderStops && order.orderStops.length > 0 && (
              <div className="px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <RouteIcon className="h-3.5 w-3.5" />
                  Intermediate stops ({order.orderStops.length})
                </div>
                <div className="space-y-2">
                  {order.orderStops.map((s) => (
                    <div key={s.id} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                        {s.stopIndex}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{s.city}</p>
                        <p className="text-xs text-muted-foreground">{s.address}</p>
                        {(s.contactName || s.contactPhone) && (
                          <p className="text-xs text-muted-foreground">
                            {s.contactName}
                            {s.contactName && s.contactPhone ? ' · ' : ''}
                            {s.contactPhone}
                          </p>
                        )}
                        {s.instructions && (
                          <p className="mt-0.5 text-xs italic text-muted-foreground">
                            {s.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cargo — strong layout even when empty */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <CargoStat
                  icon={Package}
                  label="Cargo"
                  value={order.cargoDescription || 'Not set'}
                  empty={!order.cargoDescription}
                />
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
                    assignedVehicle
                      ? assignedVehicle.type.toLowerCase().replace(/_/g, ' ')
                      : 'Unassigned'
                  }
                  empty={!assignedVehicle}
                />
                <CargoStat
                  icon={Box}
                  label="Value"
                  value={formatMoney(order.price, order.currency)}
                />
              </div>
              {(order.notes || order.deliveryNotes) && (
                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
                  {order.notes && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Internal notes
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{order.notes}</p>
                    </div>
                  )}
                  {order.deliveryNotes && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Delivery instructions
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{order.deliveryNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dispatch assignment — rich entity panels */}
            {(canViewFleet || canViewDispatch || canAssign) && (
              <div className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <RouteIcon className="h-3.5 w-3.5" />
                    Dispatch assignment
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {canViewFleet && order.vehicleId && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to="/app/fleet-tracking" search={{ vehicleId: order.vehicleId }}>
                          <Navigation className="mr-1 h-3 w-3" />
                          Map
                        </Link>
                      </Button>
                    )}
                    {canViewDispatch && dispatch && (
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <Link to="/app/dispatches/$dispatchId" params={{ dispatchId: dispatch.id }}>
                          Open
                        </Link>
                      </Button>
                    )}
                    {canAssign && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAssignModal({ open: true, tab: 'both' })}>
                        {order.driverId ? 'Replace' : 'Assign'}
                      </Button>
                    )}
                  </div>
                </div>

                {dispatchesLoading && canViewDispatch ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <AssignmentDriver
                      driver={displayDriver}
                      fallbackAssigned={Boolean(effectiveDriverId && !canViewFleet)}
                      draftPlan={isDraftPlan && !order.driverId}
                    />
                    <AssignmentVehicle
                      vehicle={displayVehicle}
                      fallbackAssigned={Boolean(effectiveVehicleId && !canViewFleet)}
                      draftPlan={isDraftPlan && !order.vehicleId}
                    />
                    <AssignmentDispatch dispatch={canViewDispatch ? dispatch : null} hidden={!canViewDispatch} />
                  </div>
                )}

              </div>
            )}

            {/* Documents */}
            <section className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Documents
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/20 p-4">
                <OrderDocumentsPanel
                  orderId={orderId}
                  canWrite={canWriteOrder && !order.archivedAt}
                  invoice={invoice}
                  canViewInvoices={canViewInvoices}
                  orderStatus={order.status}
                />
              </div>
            </section>

            {/* Named for its source: Documents above holds POD files the office
                uploads, and this is what the driver submitted from the app. Two
                sections headed "Proof of Delivery" on one page said nothing
                about which was which. */}
            {/* Driver's POD + Timeline — side by side */}
            <div className={canViewDispatch ? 'grid grid-cols-1 gap-0 md:grid-cols-2 md:divide-x md:divide-border/50' : ''}>
              {canViewDispatch && (
                <section className="p-4">
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Driver&rsquo;s proof of delivery
                  </div>
                  {dispatchesLoading ? (
                    <Skeleton className="h-24 w-full rounded-xl" />
                  ) : (
                    <ProofOfDeliveryPanel dispatchId={dispatch?.id} />
                  )}
                </section>
              )}

              {/* Timeline */}
              <section ref={activityRef} className="p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Timeline
                </div>
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  <OrderActivityTimeline
                    entries={activityEntries}
                    highlightStatus={highlightStatus}
                  />
                </div>
              </section>
            </div>

            {/* Internal notes */}
            <section className="p-4">
              <div className="rounded-xl border border-border/60 bg-background/20 p-4">
                <OrderNotesPanel orderId={orderId} canWrite={canWriteOrder && !order.archivedAt} />
              </div>
            </section>
          </div>

          {/* -------- RIGHT OPS RAIL -------- */}
          <aside className="divide-y divide-border/70 bg-muted/10 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">
            {/* Customer */}
            <div className="p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </h3>
                <Link
                  to="/app/customers/$customerId"
                  params={{ customerId: order.customerId }}
                  className="text-[11px] font-medium text-brand hover:underline"
                >
                  Open
                </Link>
              </div>
              {customerLoading ? (
                <Skeleton className="h-14 w-full" />
              ) : customer ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">{customer.companyName}</p>
                  <p className="text-xs text-muted-foreground">{customer.contactName}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {customer.phone && (
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                        <a href={`tel:${customer.phone}`}>
                          <Phone className="mr-1 h-3 w-3" />
                          Call
                        </a>
                      </Button>
                    )}
                    {customer.email && (
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                        <a href={`mailto:${customer.email}`}>
                          <Mail className="mr-1 h-3 w-3" />
                          Email
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unavailable</p>
              )}
            </div>

            {/* Financial — badge metrics */}
            <div className="p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Financial
                </h3>
                {canViewInvoices && (
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
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <MetricBadge label="Revenue" value={formatMoney(order.price, order.currency)} tone="brand" />
                {canViewExpenses && hasExpenseData ? (
                  <MetricBadge
                    label="Cost"
                    value={formatMoney(approvedExpenseTotal, order.currency)}
                    tone="default"
                  />
                ) : (
                  <MetricBadge label="Cost" value="—" tone="default" />
                )}
                {margin != null && (
                  <MetricBadge
                    label="Margin"
                    value={formatMoney(margin, order.currency)}
                    tone={margin >= 0 ? 'good' : 'bad'}
                  />
                )}
                {canViewInvoices &&
                  (invoicesLoading ? (
                    <Skeleton className="h-[52px] w-full" />
                  ) : invoicesError ? (
                    <Button size="sm" variant="outline" className="h-[52px]" onClick={() => refetchInvoices()}>
                      Retry
                    </Button>
                  ) : (
                    <MetricBadge
                      label="Outstanding"
                      value={invoice ? formatMoney(outstanding!, invoice.currency) : '—'}
                      tone={outstanding && outstanding > 0 ? 'warn' : 'good'}
                    />
                  ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {canViewInvoices && invoice && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    Invoice · {invoice.status.toLowerCase()}
                  </Badge>
                )}
                {canViewInvoices && !invoice && !invoicesLoading && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    No invoice
                  </Badge>
                )}
                {canViewExpenses && !expensesQuery.isPending && (
                  <Badge variant="outline" className="text-[10px]">
                    {pendingExpenseCount > 0
                      ? `${pendingExpenseCount} expense pending`
                      : expenses.length > 0
                        ? `${expenses.length} expenses`
                        : 'No expenses'}
                  </Badge>
                )}
              </div>
            </div>

            {/* Live tracking */}
            {canViewFleet && order.vehicleId && liveVehicle && (
              <div className="p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Live tracking
                  </h3>
                  {/* The map route already deep-links a selection; both links
                      from here dropped the vehicle, so "Map" landed the
                      operator on the whole fleet and left them to find the
                      truck they had just been reading about. */}
                  <Link
                    to="/app/fleet-tracking"
                    search={{ vehicleId: order.vehicleId }}
                    className="text-[11px] font-medium text-brand hover:underline"
                  >
                    Map
                  </Link>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="inline-flex items-center gap-1.5 capitalize">
                    <Radio className="h-3.5 w-3.5 text-brand" />
                    <span className="font-medium">{liveVehicle.movementState.toLowerCase()}</span>
                    {liveVehicle.speedKph != null && (
                      <span className="tabular-nums text-muted-foreground">
                        · {Math.round(liveVehicle.speedKph)} km/h
                      </span>
                    )}
                  </p>
                  {liveVehicle.lastReceivedAt && (
                    <p className={cn('text-xs', liveVehicle.isStale && 'text-warning')}>
                      GPS {formatRelativeTime(liveVehicle.lastReceivedAt)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="p-3.5">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Schedule
              </h3>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Pickup</dt>
                  <dd className="font-medium tabular-nums">{formatDate(order.pickupDate)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className={cn('font-medium tabular-nums', order.isDelayed && 'text-destructive')}>
                    {formatDate(order.deliveryDate)}
                  </dd>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="tabular-nums text-muted-foreground">{formatDate(order.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="tabular-nums text-muted-foreground">{formatDate(order.updatedAt)}</dd>
                </div>
              </dl>
            </div>

            {/* Quick actions — operator hotbar */}
            {(canAssign || canAdvanceStatus || canWriteDispatch || canViewInvoices || canCancel || canEdit) && (
              <div className="p-3.5">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick actions
                </h3>
                <div className="grid grid-cols-1 gap-1.5">
                  {canAssign && (
                    <>
                      <Button size="sm" className="w-full justify-start" onClick={() => setAssignModal({ open: true, tab: 'driver' })}>
                        <User className="mr-2 h-3.5 w-3.5" />
                        {order.driverId ? 'Reassign driver' : 'Assign driver'}
                      </Button>
                      <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setAssignModal({ open: true, tab: 'vehicle' })}>
                        <Truck className="mr-2 h-3.5 w-3.5" />
                        {order.vehicleId ? 'Reassign vehicle' : 'Assign vehicle'}
                      </Button>
                    </>
                  )}
                  {canWriteDispatch &&
                    (!dispatch || dispatch.status === 'DELIVERY_FAILED') &&
                    order.status !== 'DRAFT' &&
                    order.status !== 'CANCELLED' && (
                    <Button asChild size="sm" variant="outline" className="w-full justify-start">
                      <Link to="/app/dispatches/create" search={{ orderId: order.id }}>
                        <RouteIcon className="mr-2 h-3.5 w-3.5" />
                        {dispatch?.status === 'DELIVERY_FAILED' ? 'Re-dispatch' : 'Create dispatch'}
                      </Link>
                    </Button>
                  )}
                  {canViewDispatch && dispatch && (
                    <Button asChild size="sm" variant="outline" className="w-full justify-start">
                      <Link to="/app/dispatches/$dispatchId" params={{ dispatchId: dispatch.id }}>
                        <RouteIcon className="mr-2 h-3.5 w-3.5" />
                        Open dispatch
                      </Link>
                    </Button>
                  )}
                  {canViewInvoices && !invoice && order.status === 'DELIVERED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      disabled={creatingInvoice}
                      onClick={async () => {
                        try {
                          await createInvoiceFromOrder(orderId);
                          toast.success('Invoice created');
                        } catch (err) {
                          toast.error(describeError(err, 'Failed'));
                        }
                      }}
                    >
                      <Receipt className="mr-2 h-3.5 w-3.5" />
                      {creatingInvoice ? 'Creating…' : 'Generate invoice'}
                    </Button>
                  )}
                  {canViewInvoices && invoice && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setInvoiceSheetId(invoice.id)}
                    >
                      <FileText className="mr-2 h-3.5 w-3.5" />
                      Open invoice
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setEditOpen(true)}>
                      <Edit2 className="mr-2 h-3.5 w-3.5" />
                      Edit order
                    </Button>
                  )}
                  {canAdvanceStatus &&
                    allowedTransitions.map((nextStatus) =>
                      nextStatus === 'DELIVERED' ? (
                        <ConfirmDialog
                          key={nextStatus}
                          open={pendingDeliverConfirm}
                          onOpenChange={setPendingDeliverConfirm}
                          trigger={
                            <Button size="sm" className="w-full justify-start" disabled={statusLoading}>
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                              Mark delivered
                            </Button>
                          }
                          title={`Mark ${order.orderNumber} delivered?`}
                          description="This closes the shipment."
                          confirmLabel={statusLoading ? 'Updating…' : 'Mark delivered'}
                          cancelLabel="Keep open"
                          onConfirm={() => handleStatusTransition('DELIVERED')}
                        />
                      ) : nextStatus === 'PENDING' ? (
                        <ConfirmDialog
                          key={nextStatus}
                          open={pendingConfirmOrder}
                          onOpenChange={setPendingConfirmOrder}
                          trigger={
                            <Button size="sm" variant="default" className="w-full justify-start" disabled={statusLoading}>
                              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                              Confirm order
                            </Button>
                          }
                          title={`Confirm ${order.orderNumber}?`}
                          description="This activates the order and makes it available for dispatch. You won't be able to undo this step."
                          confirmLabel={statusLoading ? 'Confirming…' : 'Confirm order'}
                          cancelLabel="Go back"
                          onConfirm={() => handleStatusTransition('PENDING')}
                        />
                      ) : (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => handleStatusTransition(nextStatus)}
                          disabled={statusLoading}
                        >
                          {TRANSITION_LABELS[nextStatus] ?? `Move to ${statusLabel(nextStatus)}`}
                        </Button>
                      ),
                    )}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => setShowCancel(true)}
                    >
                      <XCircle className="mr-2 h-3.5 w-3.5" />
                      Cancel order
                    </Button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {canEdit && <OrdersEditSheet open={editOpen} onOpenChange={setEditOpen} order={order} />}
      {canViewInvoices && (
        <InvoiceDetailSheet
          invoiceId={invoiceSheetId}
          onOpenChange={(open) => {
            if (!open) setInvoiceSheetId(null);
          }}
        />
      )}
      {canAssign && (
        <AssignModal
          open={assignModal.open}
          onOpenChange={(open) => setAssignModal((prev) => ({ ...prev, open }))}
          orderId={orderId}
          order={order}
          dispatch={dispatch}
          initialTab={assignModal.tab}
          preselectedDriverId={effectiveDriverId}
          preselectedVehicleId={effectiveVehicleId}
        />
      )}
    </div>
  );
}

/// Read-only display of the optional stop-level fields added in Phase 1 of the
/// location architecture (TD-TELEMATICS-04). Returns null when none of the
/// fields carry data so pre-existing orders look unchanged.
function StopExtraInfo({
  stopLabel,
  placeName,
  postalCode,
  countryCode,
  contactName,
  contactPhone,
  instructions,
  windowStart,
  windowEnd,
}: {
  stopLabel: string;
  placeName: string | null;
  postalCode: string | null;
  countryCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  instructions: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}) {
  const hasWindow = Boolean(windowStart && windowEnd);
  const hasContact = Boolean(contactName || contactPhone);
  const hasAny = Boolean(placeName || postalCode || countryCode || hasWindow || hasContact || instructions);
  if (!hasAny) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
      {placeName && (
        <p className="text-xs font-medium text-foreground">{placeName}</p>
      )}
      {(postalCode || countryCode) && (
        <p className="text-[11px] text-muted-foreground">
          {[postalCode, countryCode].filter(Boolean).join(' · ')}
        </p>
      )}
      {hasWindow && (
        <div className="flex items-center gap-1.5 text-xs">
          <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{stopLabel} window</span>
          <span className="font-medium tabular-nums">
            {formatStopTime(windowStart!)} – {formatStopTime(windowEnd!)}
          </span>
        </div>
      )}
      {hasContact && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {stopLabel} contact
          </p>
          {contactName && (
            <p className="text-xs text-foreground">{contactName}</p>
          )}
          {contactPhone && (
            <a
              href={`tel:${contactPhone}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Phone className="h-3 w-3" />
              {contactPhone}
            </a>
          )}
        </div>
      )}
      {instructions && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Instructions
          </p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{instructions}</p>
        </div>
      )}
    </div>
  );
}

function AssignmentDriver({
  driver,
  fallbackAssigned,
  draftPlan,
}: {
  driver?: Driver | null;
  fallbackAssigned: boolean;
  draftPlan?: boolean;
}) {
  if (!driver && !fallbackAssigned) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-background/20 p-3">
        <div className="flex items-center gap-2.5">
          <Avatar initials="—" tone="muted" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver</p>
            <p className="text-sm text-muted-foreground">Unassigned</p>
          </div>
        </div>
      </div>
    );
  }
  if (!driver) {
    return (
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver</p>
        <p className="mt-1 text-sm font-medium">Assigned</p>
      </div>
    );
  }
  const lic = licenseLabel(driver.licenseExpiry);
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-start gap-2.5">
        <Avatar initials={(driver.firstName[0] ?? '') + (driver.lastName[0] ?? '')} />
          <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver</p>
          {draftPlan ? (
            <Badge variant="outline" className="mb-1 h-5 text-[10px] text-warning">
              Draft plan
            </Badge>
          ) : null}
          <Link
            to="/app/drivers/$driverId"
            params={{ driverId: driver.id }}
            className="block truncate text-sm font-semibold hover:text-brand hover:underline"
          >
            {driver.firstName} {driver.lastName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="h-5 text-[10px] capitalize">
              {driver.status.toLowerCase().replace(/_/g, ' ')}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{driver.employeeCode}</span>
          </div>
        </div>
      </div>
      <dl className="mt-2.5 space-y-1 text-[11px]">
        {driver.phone && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a href={`tel:${driver.phone}`} className="font-medium text-brand hover:underline">
                {driver.phone}
              </a>
            </dd>
          </div>
        )}
        {driver.licenseNumber && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">License</dt>
            <dd className="font-mono">{driver.licenseNumber}</dd>
          </div>
        )}
        {lic && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Expiry</dt>
            <dd className={cn('font-medium', lic.bad && 'text-warning')}>{lic.text}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function AssignmentVehicle({
  vehicle,
  fallbackAssigned,
  draftPlan,
}: {
  vehicle?: Vehicle | null;
  fallbackAssigned: boolean;
  draftPlan?: boolean;
}) {
  if (!vehicle && !fallbackAssigned) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-background/20 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Truck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</p>
            <p className="text-sm text-muted-foreground">Unassigned</p>
          </div>
        </div>
      </div>
    );
  }
  if (!vehicle) {
    return (
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</p>
        <p className="mt-1 text-sm font-medium">Assigned</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Truck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</p>
          {draftPlan ? (
            <Badge variant="outline" className="mb-1 h-5 text-[10px] text-warning">
              Draft plan
            </Badge>
          ) : null}
          <Link
            to="/app/vehicles/$vehicleId"
            params={{ vehicleId: vehicle.id }}
            className="block font-mono text-sm font-semibold hover:text-brand hover:underline"
          >
            {vehicle.plateNumber}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="h-5 text-[10px] capitalize">
              {vehicle.status.toLowerCase().replace(/_/g, ' ')}
            </Badge>
            <span className="text-[10px] capitalize text-muted-foreground">
              {vehicle.type.toLowerCase().replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>
      <dl className="mt-2.5 space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Capacity</dt>
          <dd className="font-medium tabular-nums">
            {vehicle.capacityKg ? `${vehicle.capacityKg} kg` : '—'}
            {vehicle.capacityM3 ? ` · ${vehicle.capacityM3} m³` : ''}
          </dd>
        </div>
        {(vehicle.make || vehicle.model) && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Unit</dt>
            <dd className="truncate font-medium">
              {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Code</dt>
          <dd className="font-mono">{vehicle.vehicleCode}</dd>
        </div>
      </dl>
    </div>
  );
}

function AssignmentDispatch({
  dispatch,
  hidden,
}: {
  dispatch: ApiDispatch | null;
  hidden?: boolean;
}) {
  if (hidden) return null;
  if (!dispatch) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-background/20 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <RouteIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dispatch</p>
            <p className="text-sm text-muted-foreground">Not created</p>
          </div>
        </div>
      </div>
    );
  }
  const isFailed = dispatch.status === 'DELIVERY_FAILED';
  return (
    <div className={cn(
      'rounded-lg border p-3',
      isFailed
        ? 'border-destructive/30 bg-destructive/[0.04]'
        : 'border-border/70 bg-background/40',
    )}>
      <div className="flex items-start gap-2.5">
        <span className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md',
          isFailed ? 'bg-destructive/10 text-destructive' : 'bg-brand/10 text-brand',
        )}>
          {isFailed ? <XCircle className="h-4 w-4" /> : <RouteIcon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dispatch</p>
          <Link
            to="/app/dispatches/$dispatchId"
            params={{ dispatchId: dispatch.id }}
            className="block font-mono text-sm font-semibold hover:text-brand hover:underline"
          >
            {dispatch.dispatchNumber}
          </Link>
          <Badge
            variant="outline"
            className={cn('mt-1 h-5 text-[10px] capitalize', isFailed && 'border-destructive/40 text-destructive')}
          >
            {dispatch.status.toLowerCase().replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>
      <dl className="mt-2.5 space-y-1 text-[11px]">
        {isFailed && dispatch.failureReason && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Reason</dt>
            <dd className="font-medium text-destructive">
              {FAILURE_REASON_LABELS[dispatch.failureReason] ?? dispatch.failureReason}
            </dd>
          </div>
        )}
        {dispatch.createdBy && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Dispatcher</dt>
            <dd className="truncate font-medium">
              {dispatch.createdBy.firstName} {dispatch.createdBy.lastName}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Created</dt>
          <dd className="tabular-nums">{formatDate(dispatch.createdAt)}</dd>
        </div>
      </dl>
    </div>
  );
}
