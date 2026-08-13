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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { StatusBadge } from '@/components/shared/status-badge';
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
import { InvoiceDetailSheet } from '@/components/finance/invoice-detail-sheet';
import {
  useOrder,
  useAssignOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  useArchiveOrder,
  useRestoreOrder,
  type OrderStatus,
} from '@/lib/api/orders';
import { auditLogsAPI } from '@/lib/api/audit-logs';
import { useAvailability } from '@/lib/api/availability';
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
  Route as RouteIcon,
  Ruler,
  Scale,
  Truck,
  User,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { formatMoney, formatDate, formatRelativeTime } from '@/lib/format';
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
  const { assign, loading: assignLoading } = useAssignOrder();
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

  const {
    data: availability,
    loading: availabilityLoading,
    error: availabilityError,
    refetch: refetchAvailability,
  } = useAvailability(
    order && canOperateOrder
      ? { pickupDate: order.pickupDate, deliveryDate: order.deliveryDate }
      : undefined,
    { enabled: canOperateOrder },
  );

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
  const [showAssign, setShowAssign] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [assignError, setAssignError] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
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

  const openAssign = () => {
    setShowAssign(true);
    setAssignError('');
  };

  const handleAssign = async () => {
    if (!driverId || !vehicleId) {
      setAssignError('Driver and vehicle required');
      return;
    }
    try {
      await assign(orderId, { driverId, vehicleId });
      toast.success(hasEffectiveAssignment(order, dispatch) ? 'Reassigned' : 'Assigned');
      setShowAssign(false);
      setDriverId('');
      setVehicleId('');
      setAssignError('');
    } catch (err) {
      setAssignError(describeError(err, 'Failed to assign'));
    }
  };

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
              <Button size="sm" onClick={openAssign} data-testid="orders-assign-toggle">
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* -------- LEFT WORK SURFACE -------- */}
          <div className="divide-y divide-border/70 border-r-0 lg:border-r lg:border-border/70">
            {/* Route — Pickup / Delivery */}
            <div className="p-4 pb-0">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <RouteIcon className="h-3.5 w-3.5" />
                Route
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="space-y-2 border-b border-border/70 p-4 md:border-b-0 md:border-r md:border-border/70">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-brand">
                  <MapPin className="h-3.5 w-3.5" />
                  Pickup
                </div>
                <p className="text-base font-semibold text-foreground">{order.pickupCity}</p>
                <p className="text-xs text-muted-foreground">{order.pickupAddress}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Planned </span>
                    <span className="font-medium tabular-nums">{formatDate(order.pickupDate)}</span>
                  </span>
                  {dispatch?.pickupDateActual && (
                    <span>
                      <span className="text-muted-foreground">Actual </span>
                      <span className="font-medium tabular-nums">{formatDate(dispatch.pickupDateActual)}</span>
                    </span>
                  )}
                </div>
                {(customer?.contactName || customer?.phone) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    {customer?.contactName && (
                      <span className="text-muted-foreground">{customer.contactName}</span>
                    )}
                    {customer?.phone && (
                      <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-success">
                  <MapPin className="h-3.5 w-3.5" />
                  Delivery
                  {order.isDelayed && (
                    <Badge variant="destructive" className="ml-auto h-5 gap-1 px-1.5 text-[10px]">
                      <AlertTriangle className="h-3 w-3" />
                      Delayed
                    </Badge>
                  )}
                </div>
                <p className="text-base font-semibold text-foreground">{order.deliveryCity}</p>
                <p className="text-xs text-muted-foreground">{order.deliveryAddress}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Planned </span>
                    <span className={cn('font-medium tabular-nums', order.isDelayed && 'text-destructive')}>
                      {formatDate(order.deliveryDate)}
                    </span>
                  </span>
                  {(dispatch?.deliveryDateActual || order.deliveredAt) && (
                    <span>
                      <span className="text-muted-foreground">Actual </span>
                      <span className="font-medium tabular-nums">
                        {formatDate(dispatch?.deliveryDateActual || order.deliveredAt!)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Cargo — strong layout even when empty */}
            <div className="p-4">
              <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                Cargo
              </div>
              <p className="mb-3 text-sm text-foreground">{order.cargoDescription}</p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
                        <Link to="/app/fleet-tracking">
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
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={openAssign}>
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

                {showAssign && canAssign && (
                  <div className="mt-3 space-y-2 rounded-lg border border-brand/20 bg-brand/[0.04] p-3">
                    <p className="text-xs font-semibold text-foreground">
                      {hasEffectiveAssignment(order, dispatch) ? 'Replace assignment' : 'Assign driver & vehicle'}
                    </p>
                    {availabilityError ? (
                      <div className="space-y-2">
                        <p className="text-xs text-destructive">{availabilityError}</p>
                        <Button size="sm" variant="outline" onClick={() => refetchAvailability()}>
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Select value={driverId} onValueChange={setDriverId} disabled={availabilityLoading}>
                          <SelectTrigger className="h-9" data-testid="orders-assign-driver-select">
                            <SelectValue placeholder={availabilityLoading ? 'Loading…' : 'Select driver'} />
                          </SelectTrigger>
                          <SelectContent>
                            {availability?.drivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.firstName} {d.lastName} ({d.employeeCode})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={vehicleId} onValueChange={setVehicleId} disabled={availabilityLoading}>
                          <SelectTrigger className="h-9" data-testid="orders-assign-vehicle-select">
                            <SelectValue placeholder={availabilityLoading ? 'Loading…' : 'Select vehicle'} />
                          </SelectTrigger>
                          <SelectContent>
                            {availability?.vehicles.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.plateNumber} — {v.type}
                                {v.capacityKg ? ` · ${v.capacityKg} kg` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {assignError && <p className="text-xs text-destructive">{assignError}</p>}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleAssign}
                            disabled={assignLoading || availabilityLoading || !driverId || !vehicleId}
                          >
                            {assignLoading ? 'Assigning…' : 'Confirm'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowAssign(false)}>
                            Close
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            <section className="p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Documents
              </div>
              <OrderDocumentsPanel
                orderId={orderId}
                canWrite={canWriteOrder && !order.archivedAt}
                invoice={invoice}
                canViewInvoices={canViewInvoices}
                orderStatus={order.status}
              />
            </section>

            {/* Named for its source: Documents above holds POD files the office
                uploads, and this is what the driver submitted from the app. Two
                sections headed "Proof of Delivery" on one page said nothing
                about which was which. */}
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
              <OrderActivityTimeline
                entries={activityEntries}
                highlightStatus={highlightStatus}
              />
            </section>

            {/* Internal notes */}
            <section className="p-4">
              <OrderNotesPanel orderId={orderId} canWrite={canWriteOrder && !order.archivedAt} />
            </section>
          </div>

          {/* -------- RIGHT OPS RAIL -------- */}
          <aside className="divide-y divide-border/70 bg-muted/10">
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
                {canViewInvoices && invoice && (
                  <MetricBadge
                    label="Collected"
                    value={formatMoney(collected!, invoice.currency)}
                    tone="good"
                  />
                )}
                {margin != null && (
                  <MetricBadge
                    label="Margin"
                    value={formatMoney(margin, order.currency)}
                    tone={margin >= 0 ? 'good' : 'bad'}
                  />
                )}
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
                  <Link to="/app/fleet-tracking" className="text-[11px] font-medium text-brand hover:underline">
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
                      <Button size="sm" className="w-full justify-start" onClick={openAssign}>
                        <User className="mr-2 h-3.5 w-3.5" />
                        Assign driver
                      </Button>
                      <Button size="sm" variant="outline" className="w-full justify-start" onClick={openAssign}>
                        <Truck className="mr-2 h-3.5 w-3.5" />
                        Assign vehicle
                      </Button>
                    </>
                  )}
                  {canWriteDispatch && !dispatch && order.status !== 'DRAFT' && order.status !== 'CANCELLED' && (
                    <Button asChild size="sm" variant="outline" className="w-full justify-start">
                      <Link to="/app/dispatches/create" search={{ orderId: order.id }}>
                        <RouteIcon className="mr-2 h-3.5 w-3.5" />
                        Create dispatch
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
                      ) : (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => handleStatusTransition(nextStatus)}
                          disabled={statusLoading}
                        >
                          Move to {nextStatus.replace(/_/g, ' ')}
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
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand">
          <RouteIcon className="h-4 w-4" />
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
          <Badge variant="outline" className="mt-1 h-5 text-[10px] capitalize">
            {dispatch.status.toLowerCase().replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>
      <dl className="mt-2.5 space-y-1 text-[11px]">
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
