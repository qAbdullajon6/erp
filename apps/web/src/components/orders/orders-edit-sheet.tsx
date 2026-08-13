'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  useUpdateOrder,
  type Order,
  type UpdateOrderInput,
} from '@/lib/api/orders';
import { cn } from '@/lib/utils';
import {
  CURRENCIES,
  Field,
  DateField,
  dayAfter,
  validateOrderField,
  validateOrderFields,
  type OrderSectionKey,
} from '@/components/orders/order-form-shared';
import { MapPin, Package, StickyNote, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

// Edit never changes the customer, so its section set is the shared one minus 'customer'.
type SectionKey = Exclude<OrderSectionKey, 'customer'>;

const FIELD_SECTION: Record<string, SectionKey> = {
  pickupAddress: 'pickup',
  pickupCity: 'pickup',
  pickupDate: 'pickup',
  deliveryAddress: 'delivery',
  deliveryCity: 'delivery',
  deliveryDate: 'delivery',
  cargoDescription: 'cargo',
  cargoWeightKg: 'cargo',
  cargoVolumeM3: 'cargo',
  price: 'pricing',
  currency: 'pricing',
  notes: 'notes',
  deliveryNotes: 'notes',
};

type Errors = Record<string, string>;

const ALL_FIELDS = Object.keys(FIELD_SECTION);

function validateAll(data: UpdateOrderInput): Errors {
  return validateOrderFields(ALL_FIELDS, data);
}

function orderToForm(order: Order): UpdateOrderInput {
  return {
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
  };
}

interface OrdersEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
}

/// Edit uses the same right Sheet pattern as create — list/detail stay visible.
export function OrdersEditSheet({ open, onOpenChange, order }: OrdersEditSheetProps) {
  const { update, loading } = useUpdateOrder();
  const [formData, setFormData] = useState<UpdateOrderInput>(() => orderToForm(order));
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [discardOpen, setDiscardOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef(JSON.stringify(orderToForm(order)));
  const leaveConfirmedRef = useRef(false);

  useEffect(() => {
    if (open) {
      const next = orderToForm(order);
      setFormData(next);
      baselineRef.current = JSON.stringify(next);
      setErrors({});
      setTouched(new Set());
      setDiscardOpen(false);
      leaveConfirmedRef.current = false;
    }
  }, [open, order]);

  const isDirty = open && JSON.stringify(formData) !== baselineRef.current;

  const blocker = useBlocker({
    shouldBlockFn: () => isDirty && !leaveConfirmedRef.current,
    withResolver: true,
    enableBeforeUnload: isDirty,
    disabled: !isDirty,
  });

  useEffect(() => {
    if (blocker.status === 'blocked') {
      setDiscardOpen(true);
    }
  }, [blocker.status]);

  const stayEditing = () => {
    // Leave already confirmed — ignore the dialog's follow-up onOpenChange(false).
    if (leaveConfirmedRef.current) {
      setDiscardOpen(false);
      return;
    }
    setDiscardOpen(false);
    if (blocker.status === 'blocked') {
      blocker.reset?.();
    }
  };

  const discardAndLeave = () => {
    leaveConfirmedRef.current = true;
    setDiscardOpen(false);
    onOpenChange(false);
    if (blocker.status === 'blocked') {
      blocker.proceed?.();
    }
  };

  const requestClose = () => {
    if (loading) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const setField = (field: keyof UpdateOrderInput, value: string | number | undefined) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setTouched((prev) => new Set(prev).add(field));
    setErrors((prev) => {
      const out = { ...prev };
      for (const f of [field, 'deliveryDate'] as string[]) {
        const err = validateOrderField(f, next);
        if (err && (touched.has(f) || f === field)) out[f] = err;
        else delete out[f];
      }
      return out;
    });
  };

  const errorsBySection = useMemo(() => {
    const counts: Record<SectionKey, number> = {
      pickup: 0,
      delivery: 0,
      cargo: 0,
      pricing: 0,
      notes: 0,
    };
    for (const field of Object.keys(errors)) {
      const section = FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const handleSave = async () => {
    const all = validateAll(formData);
    setErrors(all);
    setTouched(new Set(ALL_FIELDS));
    if (Object.keys(all).length > 0) {
      toast.error('Fix the highlighted fields');
      const first = ALL_FIELDS.find((f) => all[f]);
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector(`[data-field="${first}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el?.querySelector('input,textarea,button') as HTMLElement | null)?.focus?.();
      });
      return;
    }

    try {
      await update(order.id, formData);
      baselineRef.current = JSON.stringify(formData);
      toast.success('Order updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update'));
    }
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!loading) void handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading]);

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        // Keep the sheet mounted while dirty — only requestClose may close it.
        requestClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]"
        onInteractOutside={(e) => {
          if (isDirty || discardOpen) {
            e.preventDefault();
            if (isDirty) setDiscardOpen(true);
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isDirty || discardOpen) {
            e.preventDefault();
            if (isDirty && !discardOpen) setDiscardOpen(true);
          }
        }}
        onPointerDownOutside={(e) => {
          if (isDirty || discardOpen) {
            e.preventDefault();
            if (isDirty) setDiscardOpen(true);
          }
        }}
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Edit {order.orderNumber}</SheetTitle>
          <SheetDescription className="text-xs">
            Status, driver and vehicle are managed by dispatch — not here.
            {isDirty ? ' · Unsaved changes' : ''}
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">Pickup</h3>
                  {errorsBySection.pickup > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                      {errorsBySection.pickup}
                    </Badge>
                  )}
                </div>
                <Field id="edit-pickupCity" label="City" required error={errors.pickupCity}>
                  <Input
                    id="edit-pickupCity"
                    value={formData.pickupCity ?? ''}
                    onChange={(e) => setField('pickupCity', e.target.value)}
                    className={cn('h-9', errors.pickupCity && 'border-destructive')}
                  />
                </Field>
                <Field id="edit-pickupAddress" label="Address" required error={errors.pickupAddress}>
                  <Input
                    id="edit-pickupAddress"
                    value={formData.pickupAddress ?? ''}
                    onChange={(e) => setField('pickupAddress', e.target.value)}
                    className={cn('h-9', errors.pickupAddress && 'border-destructive')}
                  />
                </Field>
                <DateField
                  id="edit-pickupDate"
                  label="Date"
                  required
                  error={errors.pickupDate}
                  value={formData.pickupDate ?? ''}
                  onChange={(iso) => setField('pickupDate', iso)}
                />
              </section>

              <section className="space-y-3 border-t border-border/60 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10 text-success">
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">Delivery</h3>
                  {errorsBySection.delivery > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                      {errorsBySection.delivery}
                    </Badge>
                  )}
                </div>
                <Field id="edit-deliveryCity" label="City" required error={errors.deliveryCity}>
                  <Input
                    id="edit-deliveryCity"
                    value={formData.deliveryCity ?? ''}
                    onChange={(e) => setField('deliveryCity', e.target.value)}
                    className={cn('h-9', errors.deliveryCity && 'border-destructive')}
                  />
                </Field>
                <Field id="edit-deliveryAddress" label="Address" required error={errors.deliveryAddress}>
                  <Input
                    id="edit-deliveryAddress"
                    value={formData.deliveryAddress ?? ''}
                    onChange={(e) => setField('deliveryAddress', e.target.value)}
                    className={cn('h-9', errors.deliveryAddress && 'border-destructive')}
                  />
                </Field>
                <DateField
                  id="edit-deliveryDate"
                  label="Date"
                  required
                  error={errors.deliveryDate}
                  value={formData.deliveryDate ?? ''}
                  onChange={(iso) => setField('deliveryDate', iso)}
                  disabledBefore={formData.pickupDate ? dayAfter(formData.pickupDate) : undefined}
                />
              </section>
            </div>

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Package className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold">Cargo</h3>
              </div>
              <Field id="edit-cargoDescription" label="Description" required error={errors.cargoDescription}>
                <Textarea
                  id="edit-cargoDescription"
                  value={formData.cargoDescription ?? ''}
                  onChange={(e) => setField('cargoDescription', e.target.value)}
                  rows={2}
                  className={cn(errors.cargoDescription && 'border-destructive')}
                />
              </Field>
              <div className="grid max-w-md grid-cols-2 gap-3">
                <Field id="edit-cargoWeightKg" label="Weight (kg)" error={errors.cargoWeightKg}>
                  <Input
                    id="edit-cargoWeightKg"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cargoWeightKg ?? ''}
                    onChange={(e) =>
                      setField('cargoWeightKg', e.target.value ? parseFloat(e.target.value) : undefined)
                    }
                    className="h-9"
                  />
                </Field>
                <Field id="edit-cargoVolumeM3" label="Volume (m³)" error={errors.cargoVolumeM3}>
                  <Input
                    id="edit-cargoVolumeM3"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cargoVolumeM3 ?? ''}
                    onChange={(e) =>
                      setField('cargoVolumeM3', e.target.value ? parseFloat(e.target.value) : undefined)
                    }
                    className="h-9"
                  />
                </Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Wallet className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold">Pricing</h3>
              </div>
              <div className="grid max-w-md grid-cols-[1fr_140px] gap-3">
                <Field id="edit-price" label="Customer price" required error={errors.price}>
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price ?? ''}
                    onChange={(e) => setField('price', e.target.value ? parseFloat(e.target.value) : 0)}
                    className="h-9"
                  />
                </Field>
                <Field id="edit-currency" label="Currency" error={errors.currency}>
                  <Select
                    value={formData.currency || 'USD'}
                    onValueChange={(v) => setField('currency', v)}
                  >
                    <SelectTrigger id="edit-currency" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <Separator />

            <section className="space-y-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <StickyNote className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold">Notes</h3>
              </div>
              <Field id="edit-notes" label="Internal notes" error={errors.notes}>
                <Textarea
                  id="edit-notes"
                  value={formData.notes ?? ''}
                  onChange={(e) => setField('notes', e.target.value)}
                  rows={3}
                />
              </Field>
              <Field id="edit-deliveryNotes" label="Delivery instructions" error={errors.deliveryNotes}>
                <Textarea
                  id="edit-deliveryNotes"
                  value={formData.deliveryNotes ?? ''}
                  onChange={(e) => setField('deliveryNotes', e.target.value)}
                  rows={3}
                />
              </Field>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={requestClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
    <ConfirmDialog
      open={discardOpen}
      onOpenChange={(next) => {
        if (next) {
          setDiscardOpen(true);
          return;
        }
        // Escape / overlay dismiss on the dialog = Stay
        stayEditing();
      }}
      title="You have unsaved changes"
      description="Leave anyway? Your edits to this order will be lost."
      confirmLabel="Leave"
      cancelLabel="Stay"
      destructive
      onCancel={stayEditing}
      onConfirm={discardAndLeave}
    />
    </>
  );
}
