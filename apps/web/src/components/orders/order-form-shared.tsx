'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CalendarIcon, ChevronDown } from 'lucide-react';

/// Shared between OrdersCreateSheet and OrdersEditSheet — both sheets validate
/// and render the same order fields (create additionally has `customerId`,
/// edit never edits it). Previously each file hand-copied its own Field,
/// DateField, and per-field validation rules, which meant a validation-rule
/// change made in one sheet and not the other was an easy miss.

export { CURRENCIES } from '@/lib/locale';

export type OrderSectionKey = 'customer' | 'pickup' | 'delivery' | 'cargo' | 'pricing' | 'notes';

/// The subset of CreateOrderInput/UpdateOrderInput this validator needs —
/// both real input types satisfy this shape.
export interface OrderFormFields {
  customerId?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupDate?: string;
  pickupPostalCode?: string;
  pickupCountryCode?: string;
  pickupPlaceName?: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupInstructions?: string;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryDate?: string;
  deliveryPostalCode?: string;
  deliveryCountryCode?: string;
  deliveryPlaceName?: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  deliveryInstructions?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
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
    case 'pickupPostalCode':
      if (data.pickupPostalCode && data.pickupPostalCode.length > 20) return 'Max 20 characters';
      return null;
    case 'pickupCountryCode':
      if (data.pickupCountryCode && data.pickupCountryCode.length !== 2) return '2-letter ISO code (e.g. UZ)';
      return null;
    case 'pickupPlaceName':
      if (data.pickupPlaceName && data.pickupPlaceName.length > 200) return 'Max 200 characters';
      return null;
    case 'pickupContactName':
      if (data.pickupContactName && data.pickupContactName.length > 100) return 'Max 100 characters';
      return null;
    case 'pickupContactPhone':
      if (data.pickupContactPhone && data.pickupContactPhone.length > 30) return 'Max 30 characters';
      return null;
    case 'pickupInstructions':
      if (data.pickupInstructions && data.pickupInstructions.length > 2000) return 'Max 2000 characters';
      return null;
    case 'pickupWindowStart': {
      const start = data.pickupWindowStart;
      const end = data.pickupWindowEnd;
      if (!start && !end) return null;
      if (start && !end) return 'Window end time is required';
      return null;
    }
    case 'pickupWindowEnd': {
      const start = data.pickupWindowStart;
      const end = data.pickupWindowEnd;
      if (!start && !end) return null;
      if (end && !start) return 'Window start time is required';
      if (start && end && new Date(end) < new Date(start)) return 'Must be after start time';
      return null;
    }
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
      if (data.pickupDate && new Date(data.deliveryDate) < new Date(data.pickupDate)) {
        return 'Cannot be before the pickup date';
      }
      return null;
    case 'deliveryPostalCode':
      if (data.deliveryPostalCode && data.deliveryPostalCode.length > 20) return 'Max 20 characters';
      return null;
    case 'deliveryCountryCode':
      if (data.deliveryCountryCode && data.deliveryCountryCode.length !== 2) return '2-letter ISO code (e.g. UZ)';
      return null;
    case 'deliveryPlaceName':
      if (data.deliveryPlaceName && data.deliveryPlaceName.length > 200) return 'Max 200 characters';
      return null;
    case 'deliveryContactName':
      if (data.deliveryContactName && data.deliveryContactName.length > 100) return 'Max 100 characters';
      return null;
    case 'deliveryContactPhone':
      if (data.deliveryContactPhone && data.deliveryContactPhone.length > 30) return 'Max 30 characters';
      return null;
    case 'deliveryInstructions':
      if (data.deliveryInstructions && data.deliveryInstructions.length > 2000) return 'Max 2000 characters';
      return null;
    case 'deliveryWindowStart': {
      const start = data.deliveryWindowStart;
      const end = data.deliveryWindowEnd;
      if (!start && !end) return null;
      if (start && !end) return 'Window end time is required';
      return null;
    }
    case 'deliveryWindowEnd': {
      const start = data.deliveryWindowStart;
      const end = data.deliveryWindowEnd;
      if (!start && !end) return null;
      if (end && !start) return 'Window start time is required';
      if (start && end && new Date(end) < new Date(start)) return 'Must be after start time';
      return null;
    }
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

export interface StopFormValues {
  address?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
  placeName?: string;
  contactName?: string;
  contactPhone?: string;
  instructions?: string;
  windowStart?: string;
  windowEnd?: string;
}

export function validateStopField(field: string, stop: StopFormValues): string | null {
  switch (field) {
    case 'address':
      if (!stop.address?.trim()) return 'Address is required';
      if (stop.address.length > 300) return 'Max 300 characters';
      return null;
    case 'city':
      if (!stop.city?.trim()) return 'City is required';
      if (stop.city.length > 100) return 'Max 100 characters';
      return null;
    case 'postalCode':
      if (stop.postalCode && stop.postalCode.length > 20) return 'Max 20 characters';
      return null;
    case 'countryCode':
      if (stop.countryCode && stop.countryCode.length !== 2) return '2-letter ISO code (e.g. UZ)';
      return null;
    case 'placeName':
      if (stop.placeName && stop.placeName.length > 200) return 'Max 200 characters';
      return null;
    case 'contactName':
      if (stop.contactName && stop.contactName.length > 200) return 'Max 200 characters';
      return null;
    case 'contactPhone':
      if (stop.contactPhone && stop.contactPhone.length > 50) return 'Max 50 characters';
      return null;
    case 'instructions':
      if (stop.instructions && stop.instructions.length > 1000) return 'Max 1000 characters';
      return null;
    case 'windowStart': {
      const start = stop.windowStart;
      const end = stop.windowEnd;
      if (!start && !end) return null;
      if (start && !end) return 'Window end time is required';
      return null;
    }
    case 'windowEnd': {
      const start = stop.windowStart;
      const end = stop.windowEnd;
      if (!start && !end) return null;
      if (end && !start) return 'Window start time is required';
      if (start && end && new Date(end) < new Date(start)) return 'Must be after start time';
      return null;
    }
    default:
      return null;
  }
}

export function validateStopFields(
  fields: readonly string[],
  stop: StopFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const err = validateStopField(f, stop);
    if (err) errors[f] = err;
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

/// Extracts HH:MM from an ISO datetime string without timezone conversion,
/// matching the project's existing convention of treating date/time strings as
/// opaque slices rather than converting through the local timezone.
function toTimeValue(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(11, 16); // 'HH:MM'
}

/// Combines a date string (yyyy-MM-dd) and a time string (HH:MM) into the
/// ISO datetime format expected by the API (@IsDateString on the backend).
function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

export interface StopDetailValues {
  postalCode: string | undefined;
  countryCode: string | undefined;
  placeName: string | undefined;
  contactName: string | undefined;
  contactPhone: string | undefined;
  instructions: string | undefined;
  windowStart: string | undefined;
  windowEnd: string | undefined;
}

/// Collapsible "Advanced stop details" panel — rendered inside both Pickup and
/// Delivery sections of the create and edit sheets. All fields are optional;
/// the primary stop fields (city, address, date) remain always visible.
export function StopDetailsSection({
  prefix,
  idPrefix,
  date,
  values,
  errors,
  onChange,
}: {
  prefix: 'pickup' | 'delivery';
  /// Form ID namespace — '' in the create sheet, 'edit-' in the edit sheet.
  idPrefix: string;
  /// The associated primary date (yyyy-MM-dd), used to build window DateTimes.
  date: string;
  values: StopDetailValues;
  errors: Record<string, string>;
  onChange: (field: string, value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const fid = (suffix: string) => `${idPrefix}${prefix}-${suffix}`;
  const fname = (suffix: string) => `${prefix}${suffix[0].toUpperCase()}${suffix.slice(1)}`;

  const contactLabel =
    prefix === 'pickup' ? 'Person at pickup location' : 'Person at delivery location';

  const windowStartTime = toTimeValue(values.windowStart);
  const windowEndTime = toTimeValue(values.windowEnd);

  const handleTimeChange = (which: 'WindowStart' | 'WindowEnd', time: string) => {
    const field = `${prefix}${which}`;
    if (!time) {
      onChange(field, undefined);
      return;
    }
    onChange(field, combineDateTime(date || '1970-01-01', time));
  };

  const advancedErrorFields = [
    fname('PostalCode'),
    fname('CountryCode'),
    fname('PlaceName'),
    fname('ContactName'),
    fname('ContactPhone'),
    fname('Instructions'),
    fname('WindowStart'),
    fname('WindowEnd'),
  ];
  const hasAdvancedErrors = advancedErrorFields.some((f) => errors[f]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-1.5 rounded px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            hasAdvancedErrors && 'text-destructive hover:text-destructive',
          )}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn('h-3 w-3 shrink-0 transition-transform duration-150', open && 'rotate-180')}
          />
          <span>Advanced stop details</span>
          {hasAdvancedErrors && (
            <span className="ml-auto text-[10px] font-semibold text-destructive">
              {advancedErrorFields.filter((f) => errors[f]).length}{' '}
              {advancedErrorFields.filter((f) => errors[f]).length === 1 ? 'issue' : 'issues'}
            </span>
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-md border border-border/50 bg-muted/20 p-3">
          {/* Place / business name */}
          <Field
            id={fid('placeName')}
            label="Place / business name"
            error={errors[fname('PlaceName')]}
          >
            <Input
              id={fid('placeName')}
              value={values.placeName ?? ''}
              onChange={(e) => onChange(fname('PlaceName'), e.target.value || undefined)}
              placeholder="Warehouse, depot, terminal…"
              maxLength={200}
              autoComplete="off"
              aria-invalid={Boolean(errors[fname('PlaceName')])}
              className={cn('h-9', errors[fname('PlaceName')] && 'border-destructive')}
            />
          </Field>

          {/* Postal code + Country code */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field
              id={fid('postalCode')}
              label="Postal code"
              error={errors[fname('PostalCode')]}
            >
              <Input
                id={fid('postalCode')}
                value={values.postalCode ?? ''}
                onChange={(e) => onChange(fname('PostalCode'), e.target.value || undefined)}
                placeholder="100000"
                maxLength={20}
                autoComplete="off"
                className={cn('h-9', errors[fname('PostalCode')] && 'border-destructive')}
              />
            </Field>
            <Field
              id={fid('countryCode')}
              label="Country (ISO)"
              error={errors[fname('CountryCode')]}
            >
              <Input
                id={fid('countryCode')}
                value={values.countryCode ?? ''}
                onChange={(e) =>
                  onChange(fname('CountryCode'), e.target.value.toUpperCase() || undefined)
                }
                placeholder="UZ"
                maxLength={2}
                autoComplete="off"
                className={cn('h-9 uppercase', errors[fname('CountryCode')] && 'border-destructive')}
              />
            </Field>
          </div>

          {/* Contact */}
          <Field
            id={fid('contactName')}
            label={contactLabel}
            error={errors[fname('ContactName')]}
          >
            <Input
              id={fid('contactName')}
              value={values.contactName ?? ''}
              onChange={(e) => onChange(fname('ContactName'), e.target.value || undefined)}
              placeholder="Full name"
              maxLength={100}
              autoComplete="off"
              className={cn('h-9', errors[fname('ContactName')] && 'border-destructive')}
            />
          </Field>
          <Field
            id={fid('contactPhone')}
            label="Contact phone"
            error={errors[fname('ContactPhone')]}
          >
            <Input
              id={fid('contactPhone')}
              value={values.contactPhone ?? ''}
              onChange={(e) => onChange(fname('ContactPhone'), e.target.value || undefined)}
              placeholder="+998 90 000 00 00"
              maxLength={30}
              autoComplete="off"
              type="tel"
              className={cn('h-9', errors[fname('ContactPhone')] && 'border-destructive')}
            />
          </Field>

          {/* Driver instructions */}
          <Field
            id={fid('instructions')}
            label="Driver instructions"
            error={errors[fname('Instructions')]}
          >
            <Textarea
              id={fid('instructions')}
              value={values.instructions ?? ''}
              onChange={(e) => onChange(fname('Instructions'), e.target.value || undefined)}
              placeholder="Ring bell at Gate 3, ask for warehouse staff"
              maxLength={2000}
              rows={2}
              aria-invalid={Boolean(errors[fname('Instructions')])}
              className={cn(errors[fname('Instructions')] && 'border-destructive')}
            />
          </Field>

          {/* Time window */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Time window</p>
            <div className="grid grid-cols-2 gap-3">
              <Field
                id={fid('windowStart')}
                label="From"
                error={errors[`${prefix}WindowStart`]}
              >
                <Input
                  id={fid('windowStart')}
                  type="time"
                  value={windowStartTime}
                  onChange={(e) => handleTimeChange('WindowStart', e.target.value)}
                  aria-invalid={Boolean(errors[`${prefix}WindowStart`])}
                  className={cn('h-9', errors[`${prefix}WindowStart`] && 'border-destructive')}
                />
              </Field>
              <Field
                id={fid('windowEnd')}
                label="To"
                error={errors[`${prefix}WindowEnd`]}
              >
                <Input
                  id={fid('windowEnd')}
                  type="time"
                  value={windowEndTime}
                  onChange={(e) => handleTimeChange('WindowEnd', e.target.value)}
                  aria-invalid={Boolean(errors[`${prefix}WindowEnd`])}
                  className={cn('h-9', errors[`${prefix}WindowEnd`] && 'border-destructive')}
                />
              </Field>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
