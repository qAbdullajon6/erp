'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import {
  useUpdateOrder,
  type Order,
  type UpdateOrderInput,
} from '@/lib/api/orders';
import { cn } from '@/lib/utils';
import { CalendarIcon, MapPin, Package, StickyNote, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCIES = ['USD', 'EUR', 'UZS', 'RUB', 'KZT', 'GBP', 'CNY'] as const;

type SectionKey = 'pickup' | 'delivery' | 'cargo' | 'pricing' | 'notes';

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

function validateField(field: string, data: UpdateOrderInput): string | null {
  switch (field) {
    case 'pickupAddress':
      if (!data.pickupAddress?.trim()) return 'Required';
      if ((data.pickupAddress?.length ?? 0) > 300) return 'Max 300 characters';
      return null;
    case 'pickupCity':
      if (!data.pickupCity?.trim()) return 'Required';
      if ((data.pickupCity?.length ?? 0) > 100) return 'Max 100 characters';
      return null;
    case 'pickupDate':
      return data.pickupDate ? null : 'Required';
    case 'deliveryAddress':
      if (!data.deliveryAddress?.trim()) return 'Required';
      if ((data.deliveryAddress?.length ?? 0) > 300) return 'Max 300 characters';
      return null;
    case 'deliveryCity':
      if (!data.deliveryCity?.trim()) return 'Required';
      if ((data.deliveryCity?.length ?? 0) > 100) return 'Max 100 characters';
      return null;
    case 'deliveryDate':
      if (!data.deliveryDate) return 'Required';
      if (data.pickupDate && new Date(data.deliveryDate) < new Date(data.pickupDate)) {
        return 'Cannot be before pickup';
      }
      return null;
    case 'cargoDescription':
      if (!data.cargoDescription?.trim()) return 'Required';
      if ((data.cargoDescription?.length ?? 0) > 2000) return 'Max 2000 characters';
      return null;
    case 'cargoWeightKg':
      if (data.cargoWeightKg !== undefined && data.cargoWeightKg < 0) return 'Must be ≥ 0';
      return null;
    case 'cargoVolumeM3':
      if (data.cargoVolumeM3 !== undefined && data.cargoVolumeM3 < 0) return 'Must be ≥ 0';
      return null;
    case 'price':
      if (data.price === undefined || Number.isNaN(data.price) || data.price < 0) return 'Must be ≥ 0';
      return null;
    case 'currency':
      if (data.currency && !/^[A-Z]{3}$/.test(data.currency)) return '3-letter ISO code';
      return null;
    case 'notes':
      if (data.notes && data.notes.length > 2000) return 'Max 2000 characters';
      return null;
    case 'deliveryNotes':
      if (data.deliveryNotes && data.deliveryNotes.length > 2000) return 'Max 2000 characters';
      return null;
    default:
      return null;
  }
}

const ALL_FIELDS = Object.keys(FIELD_SECTION);

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

function DateField({
  id,
  label,
  required,
  error,
  value,
  onChange,
  disabledBefore,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (iso: string) => void;
  disabledBefore?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Field id={id} label={label} required={required} error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={Boolean(error)}
            className={cn(
              'h-9 w-full justify-start px-3 text-left text-sm font-normal',
              !value && 'text-muted-foreground',
              error && 'border-destructive',
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {date ? format(date, 'EEE, MMM d, yyyy') : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            disabled={disabledBefore ? { before: new Date(`${disabledBefore}T00:00:00`) } : undefined}
            onSelect={(d) => {
              if (d) onChange(format(d, 'yyyy-MM-dd'));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
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
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFormData(orderToForm(order));
      setErrors({});
      setTouched(new Set());
    }
  }, [open, order]);

  const setField = (field: keyof UpdateOrderInput, value: string | number | undefined) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setTouched((prev) => new Set(prev).add(field));
    setErrors((prev) => {
      const out = { ...prev };
      for (const f of [field, 'deliveryDate'] as string[]) {
        const err = validateField(f, next);
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
    const all: Errors = {};
    for (const f of ALL_FIELDS) {
      const err = validateField(f, formData);
      if (err) all[f] = err;
    }
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
      toast.success('Order updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Edit {order.orderNumber}</SheetTitle>
          <SheetDescription className="text-xs">
            Status, driver and vehicle are managed by dispatch — not here.
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
                  disabledBefore={formData.pickupDate}
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
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
