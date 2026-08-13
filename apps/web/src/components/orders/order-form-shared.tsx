'use client';

import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';

/// Shared between OrdersCreateSheet and OrdersEditSheet — both sheets validate
/// and render the same order fields (create additionally has `customerId`,
/// edit never edits it). Previously each file hand-copied its own Field,
/// DateField, and per-field validation rules, which meant a validation-rule
/// change made in one sheet and not the other was an easy miss.

export const CURRENCIES = ['USD', 'EUR', 'UZS', 'RUB', 'KZT', 'GBP', 'CNY'] as const;

/// Delivery must be strictly after pickup (see validateOrderField below), so the
/// delivery date picker's `disabledBefore` needs to exclude the pickup day itself,
/// not just days before it — otherwise picking the same day passes the calendar's
/// own check and only fails once the user hits submit.
export function dayAfter(iso: string): string {
  return format(addDays(new Date(`${iso}T00:00:00`), 1), 'yyyy-MM-dd');
}

export type OrderSectionKey = 'customer' | 'pickup' | 'delivery' | 'cargo' | 'pricing' | 'notes';

/// The subset of CreateOrderInput/UpdateOrderInput this validator needs —
/// both real input types satisfy this shape.
export interface OrderFormFields {
  customerId?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupDate?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDate?: string;
  cargoDescription?: string;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  price?: number;
  currency?: string;
  notes?: string;
  deliveryNotes?: string;
}

/// Mirrors CreateOrderDto/UpdateOrderDto (apps/api/src/orders/dto/*.ts): required
/// strings with max lengths, ISO date strings, non-negative decimals, ISO
/// currency. One field at a time so validation can run live as the user types.
export function validateOrderField(field: string, data: OrderFormFields): string | null {
  switch (field) {
    case 'customerId':
      return data.customerId ? null : 'Select a customer';
    case 'pickupAddress':
      if (!data.pickupAddress?.trim()) return 'Pickup address is required';
      if (data.pickupAddress.length > 300) return 'Max 300 characters';
      return null;
    case 'pickupCity':
      if (!data.pickupCity?.trim()) return 'Pickup city is required';
      if (data.pickupCity.length > 100) return 'Max 100 characters';
      return null;
    case 'pickupDate':
      return data.pickupDate ? null : 'Pickup date is required';
    case 'deliveryAddress':
      if (!data.deliveryAddress?.trim()) return 'Delivery address is required';
      if (data.deliveryAddress.length > 300) return 'Max 300 characters';
      return null;
    case 'deliveryCity':
      if (!data.deliveryCity?.trim()) return 'Delivery city is required';
      if (data.deliveryCity.length > 100) return 'Max 100 characters';
      return null;
    case 'deliveryDate':
      if (!data.deliveryDate) return 'Delivery date is required';
      if (data.pickupDate && new Date(data.deliveryDate) <= new Date(data.pickupDate)) {
        return 'Must be after pickup date';
      }
      return null;
    case 'cargoDescription':
      if (!data.cargoDescription?.trim()) return 'Cargo description is required';
      if (data.cargoDescription.length > 2000) return 'Max 2000 characters';
      return null;
    case 'cargoWeightKg':
      if (data.cargoWeightKg !== undefined && data.cargoWeightKg < 0) return 'Must be ≥ 0';
      return null;
    case 'cargoVolumeM3':
      if (data.cargoVolumeM3 !== undefined && data.cargoVolumeM3 < 0) return 'Must be ≥ 0';
      return null;
    case 'price':
      if (data.price === undefined || Number.isNaN(data.price) || data.price < 0) {
        return 'Price must be ≥ 0';
      }
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

export function validateOrderFields(
  fields: readonly string[],
  data: OrderFormFields,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateOrderField(field, data);
    if (err) errors[field] = err;
  }
  return errors;
}

export function Field({
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

export function DateField({
  id,
  label,
  required,
  error,
  value,
  onChange,
  disabledBefore,
  testId,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (iso: string) => void;
  disabledBefore?: string;
  /// Create-sheet fields carry a `data-testid="orders-<id>"` the RC suite
  /// depends on; edit-sheet fields never set this.
  testId?: string;
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
            data-testid={testId}
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
            disabled={
              disabledBefore ? { before: new Date(`${disabledBefore}T00:00:00`) } : undefined
            }
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
