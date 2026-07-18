'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useOrder,
  useUpdateOrder,
  useAssignOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  type UpdateOrderInput,
  type OrderStatus,
} from '@/lib/api/orders';
import { useAvailability } from '@/lib/api/availability';
import { driversAPI, type Driver } from '@/lib/api/drivers';
import { vehiclesAPI, type Vehicle } from '@/lib/api/vehicles';
import { customersAPI, type Customer } from '@/lib/api/customers';
import { useDispatches } from '@/lib/hooks/use-dispatches';
import { useInvoicesQuery, useCreateInvoiceFromOrderMutation } from '@/lib/api/invoices';
import { useCurrentUser } from '@/lib/api/auth';
import { INVOICE_READ_ROLES, FLEET_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { StatusBadge } from '@/components/shared/status-badge';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Truck,
  User,
  Package,
  Receipt,
  Route as RouteIcon,
  Clock,
  CheckCircle2,
  XCircle,
  Edit2,
  ChevronRight,
} from 'lucide-react';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import { toast } from 'sonner';

interface OrderDetailProps {
  orderId: string;
}

const STATUS_STEP_MAP: Record<OrderStatus, number> = {
  DRAFT: 0,
  PENDING: 1,
  ASSIGNED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  CANCELLED: -1,
};

function JourneyProgress({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <XCircle className="h-4 w-4" />
        Order Cancelled
      </div>
    );
  }
  const step = STATUS_STEP_MAP[status];
  const steps = ['Draft', 'Pending', 'Assigned', 'Picked Up', 'In Transit', 'Delivered'];

  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => {
        const isComplete = i <= step;
        const isCurrent = i === step;
        return (
          <div key={label} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isComplete
                    ? isCurrent
                      ? 'bg-brand text-brand-foreground'
                      : 'bg-brand/20 text-brand'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isComplete && !isCurrent ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={`mt-1 text-[10px] ${isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-0.5 mb-4 h-0.5 w-4 ${i < step ? 'bg-brand/40' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function OrdersDetail({ orderId }: OrderDetailProps) {
  const navigate = useNavigate();
  const { data: order, loading, error, refetch } = useOrder(orderId);
  const { update: updateOrder, loading: updateLoading } = useUpdateOrder();
  const { assign, loading: assignLoading } = useAssignOrder();
  const { updateStatus, loading: statusLoading } = useUpdateOrderStatus();
  const { cancel, loading: cancelLoading } = useCancelOrder();

  const { data: dispatchesForOrder } = useDispatches(1, 1, { orderId });
  const dispatch = dispatchesForOrder?.[0] ?? null;
  const { data: currentUser } = useCurrentUser();
  // Dispatcher and Driver can view an order, but InvoicesController's own
  // READ_ROLES 403s them — asking anyway just logs a doomed request on every
  // order-detail view for those two roles.
  const canViewInvoices = Boolean(
    currentUser && INVOICE_READ_ROLES.includes(currentUser.membership.role as MembershipRole),
  );
  // Same reasoning as canViewInvoices: Accountant and Sales can view an order
  // but DriversController/VehiclesController's own ROLES 403 them — this order
  // page must not fire a doomed driver/vehicle lookup for those two roles.
  const canViewFleet = Boolean(
    currentUser && FLEET_ROLES.includes(currentUser.membership.role as MembershipRole),
  );
  const { data: invoicesForOrder } = useInvoicesQuery({ orderId, limit: 1 }, canViewInvoices);
  const invoice = invoicesForOrder?.items[0] ?? null;
  const { mutateAsync: createInvoiceFromOrder, isPending: creatingInvoice } = useCreateInvoiceFromOrderMutation();

  const { data: availability, loading: availabilityLoading } = useAvailability(
    order ? { pickupDate: order.pickupDate, deliveryDate: order.deliveryDate } : undefined,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateOrderInput>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [showAssign, setShowAssign] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [assignError, setAssignError] = useState('');

  const [showCancel, setShowCancel] = useState(false);
  const [cancelNote, setCancelNote] = useState('');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assignedDriver, setAssignedDriver] = useState<Driver | null>(null);
  const [assignedVehicle, setAssignedVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!order?.customerId) return;
    customersAPI.getById(order.customerId).then(setCustomer).catch(() => setCustomer(null));
  }, [order?.customerId]);

  useEffect(() => {
    if (!order?.driverId || !canViewFleet) { setAssignedDriver(null); return; }
    driversAPI.getById(order.driverId).then(setAssignedDriver).catch(() => setAssignedDriver(null));
  }, [order?.driverId, canViewFleet]);

  useEffect(() => {
    if (!order?.vehicleId || !canViewFleet) { setAssignedVehicle(null); return; }
    vehiclesAPI.getById(order.vehicleId).then(setAssignedVehicle).catch(() => setAssignedVehicle(null));
  }, [order?.vehicleId, canViewFleet]);

  useEffect(() => {
    if (order && !isEditing) setEditData({});
  }, [order, isEditing]);

  const handleStartEdit = () => {
    if (!order) return;
    setEditData({
      pickupAddress: order.pickupAddress,
      pickupCity: order.pickupCity,
      pickupDate: order.pickupDate.slice(0, 10),
      deliveryAddress: order.deliveryAddress,
      deliveryCity: order.deliveryCity,
      deliveryDate: order.deliveryDate.slice(0, 10),
      cargoDescription: order.cargoDescription,
      cargoWeightKg: order.cargoWeightKg ? Number(order.cargoWeightKg) : undefined,
      cargoVolumeM3: order.cargoVolumeM3 ? Number(order.cargoVolumeM3) : undefined,
      price: Number(order.price),
      currency: order.currency,
      notes: order.notes ?? '',
      deliveryNotes: order.deliveryNotes ?? '',
    });
    setEditErrors({});
    setIsEditing(true);
  };

  const handleEditChange = (field: keyof UpdateOrderInput, value: string | number) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
    setEditErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">Retry</Button>
      </div>
    );
  }

  if (!order) {
    return <div className="text-center py-12 text-muted-foreground">Order not found</div>;
  }

  const allowedTransitions = order.allowedTransitions.filter(
    (status) => status !== 'ASSIGNED' || (order.driverId && order.vehicleId),
  );
  const canEdit = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const canAssign = ['PENDING', 'ASSIGNED'].includes(order.status);
  const canCancel = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

  const validateEdit = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editData.pickupAddress?.trim()) errors.pickupAddress = 'Required';
    if (!editData.pickupCity?.trim()) errors.pickupCity = 'Required';
    if (!editData.pickupDate) errors.pickupDate = 'Required';
    if (!editData.deliveryAddress?.trim()) errors.deliveryAddress = 'Required';
    if (!editData.deliveryCity?.trim()) errors.deliveryCity = 'Required';
    if (!editData.deliveryDate) errors.deliveryDate = 'Required';
    if (editData.pickupDate && editData.deliveryDate && new Date(editData.deliveryDate) < new Date(editData.pickupDate)) {
      errors.deliveryDate = 'Must be after pickup';
    }
    if (!editData.cargoDescription?.trim()) errors.cargoDescription = 'Required';
    if (editData.price === undefined || editData.price < 0) errors.price = 'Invalid price';
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!validateEdit()) { toast.error('Fix validation errors'); return; }
    try {
      await updateOrder(orderId, editData);
      toast.success('Order updated');
      setIsEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleAssign = async () => {
    if (!driverId || !vehicleId) { setAssignError('Both required'); return; }
    try {
      await assign(orderId, { driverId, vehicleId });
      toast.success('Assigned successfully');
      setShowAssign(false);
      setDriverId('');
      setVehicleId('');
      setAssignError('');
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign');
    }
  };

  const handleStatusTransition = async (newStatus: OrderStatus) => {
    try {
      await updateStatus(orderId, { status: newStatus });
      toast.success(`Moved to ${newStatus.replace(/_/g, ' ')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleCancel = async () => {
    try {
      await cancel(orderId, { note: cancelNote });
      toast.success('Order cancelled');
      setShowCancel(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb header */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={() => navigate({ to: '/app/orders' })} className="hover:text-foreground transition-colors">
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
          Shipments
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-mono text-foreground">{order.orderNumber}</span>
      </div>

      {/* Two-column layout: Main content + Action sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* LEFT: Order content */}
        <div className="space-y-6">
          {/* Journey visual */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground">{order.orderNumber}</h1>
                <p className="text-sm text-muted-foreground">{customer?.companyName ?? 'Loading...'}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <JourneyProgress status={order.status} />

            {/* Route visualization */}
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="rounded-lg border border-brand/10 bg-brand/5 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand">
                  <MapPin className="h-3.5 w-3.5" />
                  Pickup
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Input size={1} value={editData.pickupAddress ?? ''} onChange={(e) => handleEditChange('pickupAddress', e.target.value)} placeholder="Address" className={editErrors.pickupAddress ? 'border-red-500' : ''} />
                    <Input size={1} value={editData.pickupCity ?? ''} onChange={(e) => handleEditChange('pickupCity', e.target.value)} placeholder="City" className={editErrors.pickupCity ? 'border-red-500' : ''} />
                    <Input type="date" value={editData.pickupDate ?? ''} onChange={(e) => handleEditChange('pickupDate', e.target.value)} className={editErrors.pickupDate ? 'border-red-500' : ''} />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-medium text-foreground">{order.pickupCity}</p>
                    <p className="text-xs text-muted-foreground">{order.pickupAddress}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.pickupDate)}</p>
                  </>
                )}
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="h-px w-12 bg-brand/30" />
                <Truck className="h-4 w-4 text-brand" />
                <div className="h-px w-12 bg-brand/30" />
              </div>

              <div className="rounded-lg border border-success/10 bg-success/5 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-success">
                  <MapPin className="h-3.5 w-3.5" />
                  Delivery
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Input size={1} value={editData.deliveryAddress ?? ''} onChange={(e) => handleEditChange('deliveryAddress', e.target.value)} placeholder="Address" className={editErrors.deliveryAddress ? 'border-red-500' : ''} />
                    <Input size={1} value={editData.deliveryCity ?? ''} onChange={(e) => handleEditChange('deliveryCity', e.target.value)} placeholder="City" className={editErrors.deliveryCity ? 'border-red-500' : ''} />
                    <Input type="date" value={editData.deliveryDate ?? ''} onChange={(e) => handleEditChange('deliveryDate', e.target.value)} className={editErrors.deliveryDate ? 'border-red-500' : ''} />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm font-medium text-foreground">{order.deliveryCity}</p>
                    <p className="text-xs text-muted-foreground">{order.deliveryAddress}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.deliveryDate)}</p>
                  </>
                )}
              </div>
            </div>

            {isEditing && (
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={handleSaveEdit} disabled={updateLoading}>
                  {updateLoading ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setEditErrors({}); }}>
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Cargo & Notes */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Package className="h-4 w-4 text-muted-foreground" />
                Cargo Details
              </h2>
              {canEdit && !isEditing && (
                <button onClick={handleStartEdit} className="text-xs text-brand hover:text-brand/80">
                  <Edit2 className="mr-1 inline h-3 w-3" />Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="mt-4 space-y-3">
                <Textarea value={editData.cargoDescription ?? ''} onChange={(e) => handleEditChange('cargoDescription', e.target.value)} rows={2} placeholder="Cargo description" className={editErrors.cargoDescription ? 'border-red-500' : ''} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" step="0.01" value={editData.cargoWeightKg ?? ''} onChange={(e) => handleEditChange('cargoWeightKg', e.target.value ? parseFloat(e.target.value) : 0)} placeholder="Weight (kg)" />
                  <Input type="number" step="0.01" value={editData.cargoVolumeM3 ?? ''} onChange={(e) => handleEditChange('cargoVolumeM3', e.target.value ? parseFloat(e.target.value) : 0)} placeholder="Volume (m³)" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" step="0.01" value={editData.price ?? 0} onChange={(e) => handleEditChange('price', parseFloat(e.target.value) || 0)} placeholder="Price" className={editErrors.price ? 'border-red-500' : ''} />
                  <Input maxLength={3} value={editData.currency ?? ''} onChange={(e) => handleEditChange('currency', e.target.value)} placeholder="Currency" />
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-foreground">{order.cargoDescription}</p>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  {order.cargoWeightKg && <span>{order.cargoWeightKg} kg</span>}
                  {order.cargoVolumeM3 && <span>{order.cargoVolumeM3} m³</span>}
                </div>
                {order.notes && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Notes</p>
                    <p className="mt-1 text-sm text-foreground">{order.notes}</p>
                  </div>
                )}
                {order.deliveryNotes && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Delivery Instructions</p>
                    <p className="mt-1 text-sm text-foreground">{order.deliveryNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Activity
              </h2>
              <div className="mt-4 space-y-0">
                {order.statusHistory.map((entry, index) => {
                  const isLast = index === order.statusHistory!.length - 1;
                  const isLatest = index === 0;
                  return (
                    <div key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {!isLast && <div className="absolute left-[5px] top-3 h-full w-px bg-border" />}
                      <div className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${isLatest ? 'bg-brand ring-3 ring-brand/15' : 'bg-muted-foreground/40'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{entry.status.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                        </div>
                        {entry.note && <p className="mt-0.5 text-xs text-muted-foreground italic">{entry.note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Action sidebar — sticky, always visible */}
        <div className="lg:sticky lg:top-6 space-y-4">
          {/* Quick facts */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Order Value</span>
              <span className="font-semibold text-foreground">{formatMoney(order.price, order.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium text-foreground">{customer?.companyName ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">{formatDate(order.createdAt)}</span>
            </div>
            {order.isDelayed && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                <Clock className="h-3.5 w-3.5" />
                This order is delayed
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Assignment</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
                <User className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {assignedDriver
                    ? `${assignedDriver.firstName} ${assignedDriver.lastName}`
                    : order?.driverId && !canViewFleet
                      ? 'Assigned'
                      : 'No driver'}
                </p>
                {assignedDriver && <p className="text-xs text-muted-foreground">{assignedDriver.employeeCode}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
                <Truck className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {assignedVehicle
                    ? assignedVehicle.plateNumber
                    : order?.vehicleId && !canViewFleet
                      ? 'Assigned'
                      : 'No vehicle'}
                </p>
                {assignedVehicle && <p className="text-xs text-muted-foreground">{assignedVehicle.type}</p>}
              </div>
            </div>

            {canAssign && (
              <>
                <Button size="sm" variant="outline" className="w-full" onClick={() => setShowAssign(!showAssign)}>
                  {order.driverId ? 'Reassign' : 'Assign Driver & Vehicle'}
                </Button>

                {showAssign && (
                  <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                    <select value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={availabilityLoading} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" data-testid="orders-assign-driver-select">
                      <option value="">{availabilityLoading ? 'Loading...' : 'Select driver'}</option>
                      {availability?.drivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                      ))}
                    </select>
                    <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={availabilityLoading} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" data-testid="orders-assign-vehicle-select">
                      <option value="">{availabilityLoading ? 'Loading...' : 'Select vehicle'}</option>
                      {availability?.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.plateNumber} - {v.type}</option>
                      ))}
                    </select>
                    {assignError && <p className="text-xs text-destructive">{assignError}</p>}
                    <Button size="sm" className="w-full" onClick={handleAssign} disabled={assignLoading || !driverId || !vehicleId}>
                      {assignLoading ? 'Assigning...' : 'Confirm'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cross-references */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Linked</h3>
            {dispatch ? (
              <Link to="/app/dispatches/$dispatchId" params={{ dispatchId: dispatch.id }} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <RouteIcon className="h-4 w-4 text-brand" />
                  <span className="text-sm font-medium text-foreground">{dispatch.dispatchNumber}</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">No dispatch created</p>
            )}
            {canViewInvoices && (
              invoice ? (
                <Link to="/app/finance" className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-brand" />
                    <span className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ) : order.status === 'DELIVERED' ? (
                <Button size="sm" variant="outline" className="w-full" disabled={creatingInvoice} onClick={async () => {
                  try { await createInvoiceFromOrder(orderId); toast.success('Invoice created'); }
                  catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
                }}>
                  <Receipt className="mr-1.5 h-3.5 w-3.5" />
                  {creatingInvoice ? 'Creating...' : 'Create Invoice'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Invoice available after delivery</p>
              )
            )}
          </div>

          {/* Status transitions */}
          {(allowedTransitions.length > 0 || canCancel) && (
            <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</h3>
              {allowedTransitions.length > 0 && (
                <div className="space-y-2">
                  {allowedTransitions.map((nextStatus) => (
                    <Button key={nextStatus} size="sm" className="w-full" onClick={() => handleStatusTransition(nextStatus)} disabled={statusLoading}>
                      Move to {nextStatus.replace(/_/g, ' ')}
                    </Button>
                  ))}
                </div>
              )}
              {canCancel && (
                <Dialog open={showCancel} onOpenChange={setShowCancel}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" disabled={cancelLoading}>
                      Cancel Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel {order.orderNumber}?</DialogTitle>
                      <DialogDescription>This cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <Textarea placeholder="Reason (optional)" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} rows={3} maxLength={2000} />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCancel(false)}>Keep</Button>
                      <Button variant="destructive" onClick={handleCancel} disabled={cancelLoading}>
                        {cancelLoading ? 'Cancelling...' : 'Cancel Order'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
