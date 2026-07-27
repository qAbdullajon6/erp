'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateDispatch } from '@/lib/hooks/use-dispatches';
import { useOrdersList } from '@/lib/api/orders';
import { useAvailability } from '@/lib/api/availability';
import type { ApiDispatch, CreateDispatchRequest } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Package,
  StickyNote,
  Truck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

/// Orders that can receive a new dispatch — mirrors the previous full-page form.
const DISPATCHABLE_ORDER_STATUSES = new Set(['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']);

type SectionKey = 'general' | 'order' | 'driver' | 'vehicle' | 'schedule' | 'notes';

const FIELD_SECTION: Record<string, SectionKey> = {
  orderId: 'order',
  driverId: 'driver',
  vehicleId: 'vehicle',
  notes: 'notes',
};

interface Errors {
  [key: string]: string;
}

interface FormData {
  orderId: string;
  driverId: string;
  vehicleId: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  orderId: '',
  driverId: '',
  vehicleId: '',
  notes: '',
};

function validateField(field: string, data: FormData): string | null {
  switch (field) {
    case 'orderId':
      return data.orderId ? null : 'Select an order';
    case 'driverId':
      return data.driverId ? null : 'Select a driver';
    case 'vehicleId':
      return data.vehicleId ? null : 'Select a vehicle';
    case 'notes':
      if (data.notes && data.notes.length > 2000) return 'Max 2000 characters';
      return null;
    default:
      return null;
  }
}

const ALL_FIELDS = ['orderId', 'driverId', 'vehicleId', 'notes'];

function validateAll(data: FormData): Errors {
  const errors: Errors = {};
  for (const field of ALL_FIELDS) {
    const err = validateField(field, data);
    if (err) errors[field] = err;
  }
  return errors;
}

function SectionTitle({
  icon: Icon,
  title,
  errorCount,
  id,
}: {
  icon: typeof Package;
  title: string;
  errorCount: number;
  id: string;
}) {
  return (
    <div id={id} className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          errorCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-brand/10 text-brand',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {errorCount > 0 && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
        </Badge>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)} data-field={id}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-[11px] font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function formatOrderDate(iso: string): string {
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

interface DispatchesCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (dispatch: ApiDispatch) => void;
  /// Deep-link from Overview / Orders: pre-select this order when the sheet opens.
  initialOrderId?: string;
}

export function DispatchesCreateSheet({
  open,
  onOpenChange,
  onCreated,
  initialOrderId,
}: DispatchesCreateSheetProps) {
  const { create, loading } = useCreateDispatch();
  const { data: orders, loading: ordersLoading } = useOrdersList(
    { page: 1, limit: 100 },
    { enabled: open },
  );

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [orderOpen, setOrderOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const selectableOrders = useMemo(
    () => orders.filter((o) => DISPATCHABLE_ORDER_STATUSES.has(o.status)),
    [orders],
  );

  useEffect(() => {
    if (!open) {
      setFormData(EMPTY_FORM);
      setErrors({});
      setTouched(new Set());
      setOrderOpen(false);
      return;
    }
    if (initialOrderId) {
      setFormData((prev) => ({ ...EMPTY_FORM, orderId: initialOrderId, notes: prev.notes }));
    }
  }, [open, initialOrderId]);

  const selectedOrder = selectableOrders.find((o) => o.id === formData.orderId) ?? null;

  const { data: availability, loading: availabilityLoading, error: availabilityError } = useAvailability(
    selectedOrder
      ? { pickupDate: selectedOrder.pickupDate, deliveryDate: selectedOrder.deliveryDate }
      : undefined,
  );

  const selectableDrivers = availability?.drivers ?? [];
  const selectableVehicles = availability?.vehicles ?? [];
  const selectedDriver = selectableDrivers.find((d) => d.id === formData.driverId);
  const selectedVehicle = selectableVehicles.find((v) => v.id === formData.vehicleId);

  const setField = (field: keyof FormData, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Changing the order changes the availability window — clear driver/vehicle.
      if (field === 'orderId') {
        next.driverId = '';
        next.vehicleId = '';
      }
      return next;
    });
    setTouched((prev) => new Set(prev).add(field));
    setErrors((prev) => {
      const out = { ...prev };
      const probe: FormData = {
        ...formData,
        [field]: value,
        ...(field === 'orderId' ? { driverId: '', vehicleId: '' } : {}),
      };
      for (const f of field === 'orderId' ? ['orderId', 'driverId', 'vehicleId'] : [field]) {
        const err = validateField(f, probe);
        if (err && (touched.has(f) || f === field)) out[f] = err;
        else delete out[f];
      }
      return out;
    });
  };

  const errorsBySection = useMemo(() => {
    const counts: Record<SectionKey, number> = {
      general: 0,
      order: 0,
      driver: 0,
      vehicle: 0,
      schedule: 0,
      notes: 0,
    };
    for (const field of Object.keys(errors)) {
      const section = FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const noOrders = !ordersLoading && selectableOrders.length === 0;
  const hasRoute = Boolean(selectedOrder?.pickupCity && selectedOrder?.deliveryCity);

  const submitDispatch = async () => {
    const payload: CreateDispatchRequest = {
      orderId: formData.orderId,
      driverId: formData.driverId,
      vehicleId: formData.vehicleId,
      notes: formData.notes.trim() || undefined,
    };
    try {
      const result = await create(payload);
      toast.success(`Dispatch ${result.dispatchNumber} created`);
      onOpenChange(false);
      onCreated?.(result);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create dispatch'));
    }
  };

  const handleSubmit = async () => {
    const allErrors = validateAll(formData);
    setErrors(allErrors);
    setTouched(new Set(ALL_FIELDS));

    if (Object.keys(allErrors).length > 0) {
      const firstField = ALL_FIELDS.find((f) => allErrors[f]);
      toast.error('Fix the highlighted fields');
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector(
          `[data-field="${firstField}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el?.querySelector('input,textarea,button') as HTMLElement | null)?.focus?.();
      });
      return;
    }

    if (availabilityError) {
      toast.error(availabilityError);
      return;
    }

    await submitDispatch();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]"
        data-testid="dispatches-create-sheet"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New Dispatch</SheetTitle>
          <SheetDescription className="text-xs">
            Assign a driver and vehicle — the list stays behind this panel.
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">
            {/* ---------------- General ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-general"
                icon={ClipboardList}
                title="General"
                errorCount={errorsBySection.general}
              />
              <p className="text-sm text-muted-foreground">
                Creates an operational assignment for a dispatchable order. Schedule comes from the
                order — pick who is free for that window.
              </p>
            </section>

            <Separator />

            {/* ---------------- Order ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-order"
                icon={Package}
                title="Order"
                errorCount={errorsBySection.order}
              />
              {noOrders ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <p className="text-foreground">No dispatchable orders right now.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Orders must be PENDING or already on the road (not DRAFT, DELIVERED, or CANCELLED).
                  </p>
                </div>
              ) : (
                <Field id="orderId" label="Order" required error={errors.orderId}>
                  <Popover open={orderOpen} onOpenChange={setOrderOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="orderId"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={orderOpen}
                        disabled={ordersLoading}
                        className={cn(
                          'h-9 w-full justify-between font-normal',
                          !formData.orderId && 'text-muted-foreground',
                          errors.orderId && 'border-destructive',
                        )}
                        data-testid="dispatches-order-combobox"
                      >
                        {selectedOrder ? (
                          <span className="truncate">
                            <span className="font-mono">{selectedOrder.orderNumber}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {selectedOrder.pickupCity} → {selectedOrder.deliveryCity}
                            </span>
                          </span>
                        ) : (
                          ordersLoading ? 'Loading orders…' : 'Select an order…'
                        )}
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search order #, city…" />
                        <CommandList>
                          <CommandEmpty>No matching order.</CommandEmpty>
                          <CommandGroup>
                            {selectableOrders.map((order) => (
                              <CommandItem
                                key={order.id}
                                value={`${order.orderNumber} ${order.pickupCity} ${order.deliveryCity} ${order.status}`}
                                onSelect={() => {
                                  setField('orderId', order.id);
                                  setOrderOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-3.5 w-3.5',
                                    formData.orderId === order.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm">{order.orderNumber}</span>
                                    <StatusBadge status={order.status} />
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {order.pickupCity} → {order.deliveryCity}
                                  </p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </Field>
              )}

              {selectedOrder && (
                <div className="grid gap-3 rounded-lg border border-brand/10 bg-surface p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Order
                    </p>
                    <p className="mt-0.5 font-mono text-sm text-foreground">{selectedOrder.orderNumber}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </p>
                    <div className="mt-0.5">
                      <StatusBadge status={selectedOrder.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Pickup
                    </p>
                    <p className="mt-0.5 text-sm text-foreground">{selectedOrder.pickupCity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Delivery
                    </p>
                    <p className="mt-0.5 text-sm text-foreground">{selectedOrder.deliveryCity}</p>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* ---------------- Driver ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-driver"
                icon={User}
                title="Driver"
                errorCount={errorsBySection.driver}
              />
              <Field id="driverId" label="Driver" required error={errors.driverId}>
                <Select
                  value={formData.driverId || undefined}
                  onValueChange={(v) => setField('driverId', v)}
                  disabled={!selectedOrder || availabilityLoading || Boolean(availabilityError)}
                >
                  <SelectTrigger
                    id="driverId"
                    className={cn('h-9', errors.driverId && 'border-destructive')}
                    data-testid="dispatches-driver-select"
                  >
                    <SelectValue
                      placeholder={
                        !selectedOrder
                          ? 'Select an order first…'
                          : availabilityLoading
                            ? 'Checking who is free…'
                            : availabilityError
                              ? 'Availability unavailable'
                              : selectableDrivers.length === 0
                                ? 'No driver free for these dates'
                                : 'Select a driver…'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableDrivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.firstName} {driver.lastName}
                        <span className="text-muted-foreground"> · {driver.phone}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {availabilityError && selectedOrder ? (
                <p className="text-[11px] font-medium text-destructive" role="alert">
                  {availabilityError}
                </p>
              ) : null}
              {selectedDriver && (
                <div className="grid gap-3 rounded-lg border border-brand/10 bg-surface p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Code
                    </p>
                    <p className="mt-0.5 font-mono text-sm">{selectedDriver.employeeCode}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Phone
                    </p>
                    <p className="mt-0.5 text-sm">{selectedDriver.phone}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </p>
                    <div className="mt-0.5">
                      <StatusBadge status={selectedDriver.status} />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* ---------------- Vehicle ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-vehicle"
                icon={Truck}
                title="Vehicle"
                errorCount={errorsBySection.vehicle}
              />
              <Field id="vehicleId" label="Vehicle" required error={errors.vehicleId}>
                <Select
                  value={formData.vehicleId || undefined}
                  onValueChange={(v) => setField('vehicleId', v)}
                  disabled={!selectedOrder || availabilityLoading || Boolean(availabilityError)}
                >
                  <SelectTrigger
                    id="vehicleId"
                    className={cn('h-9', errors.vehicleId && 'border-destructive')}
                    data-testid="dispatches-vehicle-select"
                  >
                    <SelectValue
                      placeholder={
                        !selectedOrder
                          ? 'Select an order first…'
                          : availabilityLoading
                            ? 'Checking what is free…'
                            : availabilityError
                              ? 'Availability unavailable'
                              : selectableVehicles.length === 0
                                ? 'No vehicle free for these dates'
                                : 'Select a vehicle…'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableVehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        <span className="font-mono">{vehicle.plateNumber}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          — {vehicle.type}
                          {vehicle.capacityKg ? ` (${vehicle.capacityKg}kg)` : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {selectedVehicle && (
                <div className="grid gap-3 rounded-lg border border-brand/10 bg-surface p-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Code
                    </p>
                    <p className="mt-0.5 font-mono text-sm">{selectedVehicle.vehicleCode}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Plate
                    </p>
                    <p className="mt-0.5 font-mono text-sm">{selectedVehicle.plateNumber}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Type
                    </p>
                    <p className="mt-0.5 text-sm capitalize">{selectedVehicle.type}</p>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* ---------------- Schedule (read-only from order) ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-schedule"
                icon={CalendarIcon}
                title="Schedule"
                errorCount={errorsBySection.schedule}
              />
              {selectedOrder ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Pickup
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatOrderDate(selectedOrder.pickupDate)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selectedOrder.pickupAddress}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Delivery
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatOrderDate(selectedOrder.deliveryDate)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selectedOrder.deliveryAddress}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select an order to see its schedule.</p>
              )}
            </section>

            <Separator />

            {/* ---------------- Notes ---------------- */}
            <section className="space-y-3 pb-2">
              <SectionTitle
                id="section-notes"
                icon={StickyNote}
                title="Notes"
                errorCount={errorsBySection.notes}
              />
              <Field id="notes" label="Internal notes" error={errors.notes}>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Optional notes about this dispatch…"
                  maxLength={2000}
                  rows={3}
                  data-testid="dispatches-notes"
                />
              </Field>
            </section>
          </div>
        </div>

        {/* ---------------- Sticky footer ---------------- */}
        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              {hasRoute && selectedOrder && (
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <span className="font-medium text-foreground">{selectedOrder.pickupCity}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">{selectedOrder.deliveryCity}</span>
                </span>
              )}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading || noOrders || Boolean(availabilityError && selectedOrder)}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                data-testid="dispatches-submit-button"
              >
                {loading ? 'Creating…' : 'Create Dispatch'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
