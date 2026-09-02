'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CountrySelect } from '@/components/shared/country-select';
import { CitySelect, type CityCoords } from '@/components/shared/city-select';
import { AddressSearch } from '@/components/shared/address-search';
import { MapPicker, type MapPickerCoords } from '@/components/shared/map-picker';
import { CurrencySelect } from '@/components/shared/currency-select';
import {
  useCreateOrder,
  useCheckDuplicateOrder,
  type CreateOrderInput,
  type Order,
} from '@/lib/api/orders';
import { type PlaceSuggestion } from '@/lib/api/geocoding';
import { useCustomersList } from '@/lib/api/customers';
import { useCurrentUser } from '@/lib/api/auth';
import { CUSTOMER_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Field,
  DateField,
  validateOrderField,
  validateOrderFields,
  type OrderSectionKey,
} from '@/components/orders/order-form-shared';
import {
  IntermediateStopsSection,
  STOP_FIELDS,
  validateStop,
  type OrderStopInput,
} from '@/components/orders/intermediate-stops-section';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  ChevronsUpDown,
  MapPin,
  Package,
  StickyNote,
  Truck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

type SectionKey = OrderSectionKey;

const FIELD_SECTION: Record<string, SectionKey> = {
  customerId: 'customer',
  pickupAddress: 'pickup',
  pickupCity: 'pickup',
  pickupDate: 'pickup',
  pickupPostalCode: 'pickup',
  pickupCountryCode: 'pickup',
  pickupPlaceName: 'pickup',
  pickupContactName: 'pickup',
  pickupContactPhone: 'pickup',
  pickupInstructions: 'pickup',
  pickupWindowStart: 'pickup',
  pickupWindowEnd: 'pickup',
  deliveryAddress: 'delivery',
  deliveryCity: 'delivery',
  deliveryDate: 'delivery',
  deliveryPostalCode: 'delivery',
  deliveryCountryCode: 'delivery',
  deliveryPlaceName: 'delivery',
  deliveryContactName: 'delivery',
  deliveryContactPhone: 'delivery',
  deliveryInstructions: 'delivery',
  deliveryWindowStart: 'delivery',
  deliveryWindowEnd: 'delivery',
  cargoDescription: 'cargo',
  cargoWeightKg: 'cargo',
  cargoVolumeM3: 'cargo',
  price: 'pricing',
  currency: 'pricing',
  notes: 'notes',
  deliveryNotes: 'notes',
};

interface Errors {
  [key: string]: string;
}

const ALL_FIELDS = Object.keys(FIELD_SECTION);

function validateAll(data: CreateOrderInput): Errors {
  return validateOrderFields(ALL_FIELDS, data);
}

const EMPTY_FORM: CreateOrderInput = {
  customerId: '',
  pickupAddress: '',
  pickupCity: '',
  pickupDate: '',
  deliveryAddress: '',
  deliveryCity: '',
  deliveryDate: '',
  cargoDescription: '',
  price: 0,
  currency: 'USD',
};

function toTimeValue(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(11, 16);
}

function SectionTitle({
  icon: Icon,
  title,
  errorCount,
  id,
}: {
  icon: typeof MapPin;
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

// ─── StopPanel ────────────────────────────────────────────────────────────────

interface StopPanelProps {
  prefix: 'pickup' | 'delivery';
  errorCount: number;
  formData: CreateOrderInput;
  errors: Errors;
  onFieldChange: (field: keyof CreateOrderInput, value: string | number | undefined) => void;
  onFieldsBatch: (updates: Partial<CreateOrderInput>) => void;
  disabledBefore?: string;
  addressSuggestion: PlaceSuggestion | null;
  onAddressSuggestion: (s: PlaceSuggestion | null) => void;
  mapCoords: MapPickerCoords | null;
  onMapCoordsChange: (c: MapPickerCoords | null) => void;
  mapConfirmed: boolean;
  onMapConfirmedChange: (v: boolean) => void;
  mapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
}

function StopPanel({
  prefix,
  errorCount,
  formData,
  errors,
  onFieldChange,
  onFieldsBatch,
  disabledBefore,
  addressSuggestion,
  onAddressSuggestion,
  mapCoords,
  onMapCoordsChange,
  mapConfirmed,
  onMapConfirmedChange,
  mapOpen,
  onMapOpenChange,
}: StopPanelProps) {
  const isPickup = prefix === 'pickup';
  const Icon = isPickup ? MapPin : Truck;
  const stopLabel = isPickup ? 'Pickup' : 'Delivery';

  // Typed field name — `prefix + PascalSuffix` always matches a key in CreateOrderInput
  const fn = (suffix: string) => `${prefix}${suffix}` as keyof CreateOrderInput;

  const countryCode = (formData[fn('CountryCode')] as string | undefined) ?? '';
  const city = (formData[fn('City')] as string) ?? '';
  const postalCode = (formData[fn('PostalCode')] as string | undefined) ?? '';
  const placeName = (formData[fn('PlaceName')] as string | undefined) ?? '';
  const contactName = (formData[fn('ContactName')] as string | undefined) ?? '';
  const contactPhone = (formData[fn('ContactPhone')] as string | undefined) ?? '';
  const instructions = (formData[fn('Instructions')] as string | undefined) ?? '';
  const date = (formData[fn('Date')] as string) ?? '';
  const windowStart = formData[fn('WindowStart')] as string | undefined;
  const windowEnd = formData[fn('WindowEnd')] as string | undefined;

  const windowStartTime = toTimeValue(windowStart);
  const windowEndTime = toTimeValue(windowEnd);

  const handleCountryChange = (code: string | null) => {
    const u: Record<string, string | undefined> = {
      [`${prefix}CountryCode`]: code ?? undefined,
      [`${prefix}City`]: '',
      [`${prefix}Address`]: '',
      [`${prefix}PostalCode`]: undefined,
    };
    onFieldsBatch(u as Partial<CreateOrderInput>);
    onAddressSuggestion(null);
    onMapCoordsChange(null);
    onMapConfirmedChange(false);
  };

  const handleCityChange = (cityName: string | null, coords: CityCoords | null) => {
    const u: Record<string, string | undefined> = {
      [`${prefix}City`]: cityName ?? '',
      [`${prefix}Address`]: '',
      [`${prefix}PostalCode`]: undefined,
    };
    onFieldsBatch(u as Partial<CreateOrderInput>);
    onAddressSuggestion(null);
    onMapCoordsChange(coords ? { lat: coords.lat, lng: coords.lng } : null);
    onMapConfirmedChange(false);
  };

  const handleAddressSuggestion = (s: PlaceSuggestion | null) => {
    onAddressSuggestion(s);
    if (s) {
      const u: Record<string, unknown> = {
        [`${prefix}Address`]: s.name,
      };
      if (s.postalCode) u[`${prefix}PostalCode`] = s.postalCode;
      if (s.city) u[`${prefix}City`] = s.city;
      if (s.lat && s.lng) {
        u[`${prefix}Lat`] = s.lat;
        u[`${prefix}Lng`] = s.lng;
      }
      onFieldsBatch(u as Partial<CreateOrderInput>);
      onMapCoordsChange({ lat: s.lat, lng: s.lng });
      onMapConfirmedChange(false);
    } else {
      const u: Record<string, unknown> = {
        [`${prefix}Address`]: '',
        [`${prefix}PostalCode`]: undefined,
        [`${prefix}Lat`]: undefined,
        [`${prefix}Lng`]: undefined,
      };
      onFieldsBatch(u as Partial<CreateOrderInput>);
      onMapCoordsChange(null);
      onMapConfirmedChange(false);
    }
  };

  const handleTimeChange = (which: 'WindowStart' | 'WindowEnd', time: string) => {
    const field = fn(which);
    if (!time) {
      onFieldChange(field, undefined);
      return;
    }
    onFieldChange(field, `${date || '1970-01-01'}T${time}:00`);
  };

  return (
    <section className="space-y-3">
      <SectionTitle
        id={`section-${prefix}`}
        icon={Icon}
        title={stopLabel}
        errorCount={errorCount}
      />

      {/* Country */}
      <Field id={fn('CountryCode')} label="Country" error={errors[fn('CountryCode')]}>
        <CountrySelect
          id={fn('CountryCode')}
          value={countryCode || null}
          onChange={handleCountryChange}
          hasError={Boolean(errors[fn('CountryCode')])}
        />
      </Field>

      {/* City */}
      <Field id={fn('City')} label="City" required error={errors[fn('City')]}>
        <div data-testid={isPickup ? 'orders-pickup-city' : 'orders-delivery-city'}>
          <CitySelect
            id={fn('City')}
            countryCode={countryCode || null}
            value={city || null}
            onChange={handleCityChange}
            hasError={Boolean(errors[fn('City')])}
            placeholder={countryCode ? 'Select city…' : 'Select country first'}
          />
        </div>
      </Field>

      {/* Search address */}
      <Field id={fn('Address')} label="Search address" required error={errors[fn('Address')]}>
        <div data-testid={isPickup ? 'orders-pickup-address' : 'orders-delivery-address'}>
          <AddressSearch
            id={fn('Address')}
            countryCode={countryCode || null}
            value={addressSuggestion}
            onChange={handleAddressSuggestion}
            disabled={!city}
            placeholder={city ? 'Search street address, place, or ZIP…' : 'Select city first'}
            hasError={Boolean(errors[fn('Address')])}
          />
        </div>
      </Field>

      {/* Selected address confirmation */}
      {addressSuggestion && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
          <p className="text-sm font-medium leading-snug text-foreground">
            {addressSuggestion.name}
          </p>
          {(addressSuggestion.city || addressSuggestion.postalCode) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[addressSuggestion.city, addressSuggestion.postalCode].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* ZIP + Coordinates — shown once an address is geocoded */}
      {mapCoords && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            id={fn('PostalCode')}
            label="ZIP / Postal code"
            error={errors[fn('PostalCode')]}
          >
            <Input
              id={fn('PostalCode')}
              value={postalCode}
              onChange={(e) => onFieldChange(fn('PostalCode'), e.target.value || undefined)}
              placeholder="100000"
              maxLength={20}
              autoComplete="off"
              className={cn('h-9', errors[fn('PostalCode')] && 'border-destructive')}
            />
          </Field>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Coordinates</p>
            <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-3">
              <span className="font-mono text-[11px] text-muted-foreground">
                {mapCoords.lat.toFixed(4)}, {mapCoords.lng.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Map verify */}
      {mapCoords && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMapOpenChange(true)}
            className={cn(
              'h-8 gap-1.5 text-xs',
              mapConfirmed
                ? 'border-green-700/40 bg-green-950/20 text-green-500 hover:bg-green-950/30'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {mapConfirmed ? (
              <>
                <Check className="h-3 w-3" />
                Location confirmed — Move pin
              </>
            ) : (
              <>
                <MapPin className="h-3 w-3" />
                Verify location on map
              </>
            )}
          </Button>
          <MapPicker
            open={mapOpen}
            onClose={() => onMapOpenChange(false)}
            initialCoords={mapCoords}
            onConfirm={(coords) => {
              onMapCoordsChange(coords);
              onMapConfirmedChange(true);
              onMapOpenChange(false);
              const latKey = `${prefix}Lat` as keyof CreateOrderInput;
              const lngKey = `${prefix}Lng` as keyof CreateOrderInput;
              onFieldsBatch({ [latKey]: coords.lat, [lngKey]: coords.lng } as Partial<CreateOrderInput>);
            }}
          />
        </>
      )}

      {/* Place / business name */}
      <div className="border-t border-border/40 pt-3">
        <Field
          id={fn('PlaceName')}
          label="Place / business name"
          error={errors[fn('PlaceName')]}
        >
          <Input
            id={fn('PlaceName')}
            value={placeName}
            onChange={(e) => onFieldChange(fn('PlaceName'), e.target.value || undefined)}
            placeholder="Warehouse, depot, terminal…"
            maxLength={200}
            autoComplete="off"
            className={cn('h-9', errors[fn('PlaceName')] && 'border-destructive')}
          />
        </Field>
      </div>

      {/* Contact person + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <Field
          id={fn('ContactName')}
          label="Contact person"
          error={errors[fn('ContactName')]}
        >
          <Input
            id={fn('ContactName')}
            value={contactName}
            onChange={(e) => onFieldChange(fn('ContactName'), e.target.value || undefined)}
            placeholder="Full name"
            maxLength={100}
            autoComplete="off"
            className={cn('h-9', errors[fn('ContactName')] && 'border-destructive')}
          />
        </Field>
        <Field id={fn('ContactPhone')} label="Phone" error={errors[fn('ContactPhone')]}>
          <Input
            id={fn('ContactPhone')}
            type="tel"
            value={contactPhone}
            onChange={(e) => onFieldChange(fn('ContactPhone'), e.target.value || undefined)}
            placeholder="+998 90 000 00 00"
            maxLength={30}
            autoComplete="off"
            className={cn('h-9', errors[fn('ContactPhone')] && 'border-destructive')}
          />
        </Field>
      </div>

      {/* Appointment / time window */}
      <div className="space-y-3 border-t border-border/40 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Appointment / time window
        </p>
        <DateField
          id={fn('Date')}
          testId={isPickup ? 'orders-pickupDate' : 'orders-deliveryDate'}
          label="Date"
          required
          error={errors[fn('Date')]}
          value={date}
          onChange={(iso) => onFieldChange(fn('Date'), iso)}
          disabledBefore={disabledBefore}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id={fn('WindowStart')} label="From" error={errors[fn('WindowStart')]}>
            <Input
              id={fn('WindowStart')}
              type="time"
              value={windowStartTime}
              onChange={(e) => handleTimeChange('WindowStart', e.target.value)}
              aria-invalid={Boolean(errors[fn('WindowStart')])}
              className={cn('h-9', errors[fn('WindowStart')] && 'border-destructive')}
            />
          </Field>
          <Field id={fn('WindowEnd')} label="To" error={errors[fn('WindowEnd')]}>
            <Input
              id={fn('WindowEnd')}
              type="time"
              value={windowEndTime}
              onChange={(e) => handleTimeChange('WindowEnd', e.target.value)}
              aria-invalid={Boolean(errors[fn('WindowEnd')])}
              className={cn('h-9', errors[fn('WindowEnd')] && 'border-destructive')}
            />
          </Field>
        </div>
      </div>

      {/* Driver instructions */}
      <Field
        id={fn('Instructions')}
        label="Driver instructions"
        error={errors[fn('Instructions')]}
      >
        <Textarea
          id={fn('Instructions')}
          value={instructions}
          onChange={(e) => onFieldChange(fn('Instructions'), e.target.value || undefined)}
          placeholder={
            isPickup
              ? 'Enter through Gate 3. Check in at security. Dock 14.'
              : 'Call receiver 30 minutes before arrival. Deliver to receiving department.'
          }
          maxLength={2000}
          rows={3}
          aria-invalid={Boolean(errors[fn('Instructions')])}
          className={cn(errors[fn('Instructions')] && 'border-destructive')}
        />
      </Field>
    </section>
  );
}

// ─── OrdersCreateSheet ────────────────────────────────────────────────────────

interface OrdersCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (order: Order) => void;
  /// Pre-selects a customer when the sheet opens — used when the sheet is
  /// launched from a customer's own detail page, where re-picking them from
  /// the dropdown would just repeat what the admin already navigated from.
  defaultCustomerId?: string;
}

export function OrdersCreateSheet({
  open,
  onOpenChange,
  onCreated,
  defaultCustomerId,
}: OrdersCreateSheetProps) {
  const { create, loading } = useCreateOrder();
  const { check, loading: checkingDuplicate } = useCheckDuplicateOrder();
  const { data: currentUser } = useCurrentUser();
  const canCreateCustomer = Boolean(
    currentUser && CUSTOMER_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  const { data: customers, loading: customersLoading } = useCustomersList(
    { status: 'ACTIVE', limit: 100 },
    { enabled: open },
  );

  const [formData, setFormData] = useState<CreateOrderInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [stops, setStops] = useState<OrderStopInput[]>([]);
  const [stopErrors, setStopErrors] = useState<Record<number, Record<string, string>>>({});
  const [stopTouched, setStopTouched] = useState<Record<number, Set<string>>>({});
  const [customerOpen, setCustomerOpen] = useState(false);
  const [pastPickupConfirm, setPastPickupConfirm] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Order[]>([]);
  const acknowledgeDuplicateRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Address geocoding state — not sent to API, only used for UI flow
  const [pickupSuggestion, setPickupSuggestion] = useState<PlaceSuggestion | null>(null);
  const [deliverySuggestion, setDeliverySuggestion] = useState<PlaceSuggestion | null>(null);
  const [pickupMapCoords, setPickupMapCoords] = useState<MapPickerCoords | null>(null);
  const [deliveryMapCoords, setDeliveryMapCoords] = useState<MapPickerCoords | null>(null);
  const [pickupMapConfirmed, setPickupMapConfirmed] = useState(false);
  const [deliveryMapConfirmed, setDeliveryMapConfirmed] = useState(false);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const [deliveryMapOpen, setDeliveryMapOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormData(EMPTY_FORM);
      setErrors({});
      setTouched(new Set());
      setStops([]);
      setStopErrors({});
      setStopTouched({});
      acknowledgeDuplicateRef.current = false;
      setPickupSuggestion(null);
      setDeliverySuggestion(null);
      setPickupMapCoords(null);
      setDeliveryMapCoords(null);
      setPickupMapConfirmed(false);
      setDeliveryMapConfirmed(false);
      setPickupMapOpen(false);
      setDeliveryMapOpen(false);
    } else if (defaultCustomerId) {
      setFormData((prev) => ({ ...prev, customerId: defaultCustomerId }));
    }
  }, [open, defaultCustomerId]);

  const setField = (field: keyof CreateOrderInput, value: string | number | undefined) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setTouched((prev) => new Set(prev).add(field));
    // Live validation: re-check this field plus cross-field deps (dates, window pairs).
    const windowPairs: Partial<Record<string, string>> = {
      pickupWindowStart: 'pickupWindowEnd',
      pickupWindowEnd: 'pickupWindowStart',
      deliveryWindowStart: 'deliveryWindowEnd',
      deliveryWindowEnd: 'deliveryWindowStart',
    };
    const extra = windowPairs[field as string];
    const fieldsToCheck = extra
      ? ([field, 'deliveryDate', extra] as string[])
      : ([field, 'deliveryDate'] as string[]);
    setErrors((prev) => {
      const out = { ...prev };
      for (const f of fieldsToCheck) {
        const err = validateOrderField(f, next);
        if (err && (touched.has(f) || f === field)) out[f] = err;
        else delete out[f];
      }
      return out;
    });
  };

  // Batch-updates multiple fields atomically — used by StopPanel cascading clears.
  // Intentionally does NOT add fields to `touched` so programmatic clears (e.g.
  // clearing city/address when country changes) never show premature errors.
  const setFields = (updates: Partial<CreateOrderInput>) => {
    const next = { ...formData, ...updates };
    setFormData(next);
    setErrors((prev) => {
      const out = { ...prev };
      for (const field of Object.keys(updates)) {
        if (touched.has(field)) {
          const err = validateOrderField(field, next);
          if (err) out[field] = err;
          else delete out[field];
        } else {
          delete out[field];
        }
      }
      return out;
    });
  };

  const errorsBySection = useMemo(() => {
    const counts: Record<SectionKey, number> = {
      customer: 0,
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

  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const noCustomers = !customersLoading && customers.length === 0;
  const hasRoute = formData.pickupCity && formData.deliveryCity;

  const submitOrder = async (acknowledgeDuplicate = false) => {
    try {
      const payload: CreateOrderInput = {
        ...(acknowledgeDuplicate ? { ...formData, acknowledgeDuplicate: true } : formData),
        orderStops: stops.length > 0 ? stops : undefined,
      };
      const result = await create(payload);
      toast.success(`Order ${result.orderNumber} created`);
      onOpenChange(false);
      onCreated?.(result);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create order'));
    }
  };

  const proceedAfterDuplicateCheck = async () => {
    const pickup = new Date(`${formData.pickupDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (pickup < today) {
      setPastPickupConfirm(true);
      return;
    }
    await submitOrder(true);
  };

  const handleSubmit = async () => {
    const allErrors = validateAll(formData);
    setErrors(allErrors);
    setTouched(new Set(ALL_FIELDS));

    const allStopErrors: Record<number, Record<string, string>> = {};
    const allStopTouched: Record<number, Set<string>> = {};
    for (let i = 0; i < stops.length; i++) {
      allStopErrors[i] = validateStop(stops[i], STOP_FIELDS);
      allStopTouched[i] = new Set(STOP_FIELDS);
    }
    setStopErrors(allStopErrors);
    setStopTouched(allStopTouched);

    const hasStopErrors = Object.values(allStopErrors).some((e) => Object.keys(e).length > 0);

    if (Object.keys(allErrors).length > 0 || hasStopErrors) {
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

    try {
      const dup = await check(formData);
      if (dup.possibleDuplicate && dup.matches.length > 0) {
        setDuplicateMatches(dup.matches);
        setDuplicateConfirm(true);
        return;
      }
    } catch {
      // Non-blocking — proceed if duplicate check fails
    }

    const pickup = new Date(`${formData.pickupDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (pickup < today) {
      setPastPickupConfirm(true);
      return;
    }
    await submitOrder();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[820px]"
        data-testid="orders-create-sheet"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New Order</SheetTitle>
          <SheetDescription className="text-xs">
            Book a shipment — the list stays behind this panel.
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">

            {/* ── Customer ──────────────────────────────────────────────── */}
            <section className="space-y-3">
              <SectionTitle
                id="section-customer"
                icon={Building2}
                title="Customer"
                errorCount={errorsBySection.customer}
              />
              {noCustomers ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <p className="text-foreground">No active customers yet.</p>
                  {canCreateCustomer ? (
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link to="/app/customers/create">Create customer</Link>
                    </Button>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ask an Admin or Sales manager to add the customer first.
                    </p>
                  )}
                </div>
              ) : (
                <Field
                  id="customerId"
                  label="Customer"
                  required
                  error={errors.customerId}
                  className="max-w-md"
                >
                  <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="customerId"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerOpen}
                        aria-invalid={Boolean(errors.customerId)}
                        data-testid="orders-customer-select"
                        className={cn(
                          'h-9 w-full justify-between px-3 text-sm font-normal',
                          !selectedCustomer && 'text-muted-foreground',
                          errors.customerId && 'border-destructive',
                        )}
                      >
                        <span className="truncate">
                          {customersLoading
                            ? 'Loading customers…'
                            : selectedCustomer
                              ? `${selectedCustomer.companyName} (${selectedCustomer.contactName})`
                              : 'Search and select customer…'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Search company, contact, code…" />
                        <CommandList>
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.companyName} ${c.contactName} ${c.customerCode ?? ''}`}
                                onSelect={() => {
                                  setField('customerId', c.id);
                                  setCustomerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-3.5 w-3.5',
                                    formData.customerId === c.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm">{c.companyName}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {c.contactName}
                                    {c.customerCode ? ` · ${c.customerCode}` : ''}
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
            </section>

            <Separator />

            {/* ── Pickup + Delivery ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <StopPanel
                prefix="pickup"
                errorCount={errorsBySection.pickup}
                formData={formData}
                errors={errors}
                onFieldChange={setField}
                onFieldsBatch={setFields}
                addressSuggestion={pickupSuggestion}
                onAddressSuggestion={setPickupSuggestion}
                mapCoords={pickupMapCoords}
                onMapCoordsChange={setPickupMapCoords}
                mapConfirmed={pickupMapConfirmed}
                onMapConfirmedChange={setPickupMapConfirmed}
                mapOpen={pickupMapOpen}
                onMapOpenChange={setPickupMapOpen}
              />
              <div className="border-t border-border/60 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <StopPanel
                  prefix="delivery"
                  errorCount={errorsBySection.delivery}
                  formData={formData}
                  errors={errors}
                  onFieldChange={setField}
                  onFieldsBatch={setFields}
                  disabledBefore={formData.pickupDate || undefined}
                  addressSuggestion={deliverySuggestion}
                  onAddressSuggestion={setDeliverySuggestion}
                  mapCoords={deliveryMapCoords}
                  onMapCoordsChange={setDeliveryMapCoords}
                  mapConfirmed={deliveryMapConfirmed}
                  onMapConfirmedChange={setDeliveryMapConfirmed}
                  mapOpen={deliveryMapOpen}
                  onMapOpenChange={setDeliveryMapOpen}
                />
              </div>
            </div>

            <Separator />

            {/* ── Intermediate stops ────────────────────────────────────── */}
            <IntermediateStopsSection
              stops={stops}
              errors={stopErrors}
              touched={stopTouched}
              onChange={setStops}
              onTouch={(index, field) => {
                setStopTouched((prev) => {
                  const next = { ...prev };
                  next[index] = new Set(prev[index] ?? []).add(field);
                  return next;
                });
                setStopErrors((prev) => {
                  const next = { ...prev };
                  const errs = validateStop(stops[index], STOP_FIELDS);
                  next[index] = errs;
                  return next;
                });
              }}
            />

            <Separator />

            {/* ── Cargo ─────────────────────────────────────────────────── */}
            <section className="space-y-3">
              <SectionTitle
                id="section-cargo"
                icon={Package}
                title="Cargo"
                errorCount={errorsBySection.cargo}
              />
              <Field
                id="cargoDescription"
                label="Description"
                required
                error={errors.cargoDescription}
              >
                <Textarea
                  id="cargoDescription"
                  value={formData.cargoDescription}
                  onChange={(e) => setField('cargoDescription', e.target.value)}
                  placeholder="What is being transported — e.g. Ceramic tiles, 12 pallets"
                  maxLength={2000}
                  rows={2}
                  aria-invalid={Boolean(errors.cargoDescription)}
                  className={cn(errors.cargoDescription && 'border-destructive')}
                  data-testid="orders-cargo-description"
                />
              </Field>
              <div className="grid max-w-md grid-cols-2 gap-3">
                <Field id="cargoWeightKg" label="Weight (kg)" error={errors.cargoWeightKg}>
                  <Input
                    id="cargoWeightKg"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.cargoWeightKg ?? ''}
                    onChange={(e) =>
                      setField(
                        'cargoWeightKg',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    aria-invalid={Boolean(errors.cargoWeightKg)}
                    className={cn('h-9', errors.cargoWeightKg && 'border-destructive')}
                    data-testid="orders-cargo-weight"
                  />
                </Field>
                <Field id="cargoVolumeM3" label="Volume (m³)" error={errors.cargoVolumeM3}>
                  <Input
                    id="cargoVolumeM3"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.cargoVolumeM3 ?? ''}
                    onChange={(e) =>
                      setField(
                        'cargoVolumeM3',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    aria-invalid={Boolean(errors.cargoVolumeM3)}
                    className={cn('h-9', errors.cargoVolumeM3 && 'border-destructive')}
                    data-testid="orders-cargo-volume"
                  />
                </Field>
              </div>
            </section>

            <Separator />

            {/* ── Pricing ───────────────────────────────────────────────── */}
            <section className="space-y-3">
              <SectionTitle
                id="section-pricing"
                icon={Wallet}
                title="Pricing"
                errorCount={errorsBySection.pricing}
              />
              <div className="grid max-w-md grid-cols-[1fr_160px] gap-3">
                <Field id="price" label="Customer price" required error={errors.price}>
                  <Input
                    id="price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price || ''}
                    onChange={(e) =>
                      setField('price', e.target.value ? parseFloat(e.target.value) : 0)
                    }
                    aria-invalid={Boolean(errors.price)}
                    className={cn('h-9', errors.price && 'border-destructive')}
                    data-testid="orders-price"
                  />
                </Field>
                <Field id="currency" label="Currency" error={errors.currency}>
                  <div data-testid="orders-currency">
                    <CurrencySelect
                      id="currency"
                      value={formData.currency ?? 'USD'}
                      onChange={(v) => setField('currency', v ?? 'USD')}
                      hasError={Boolean(errors.currency)}
                    />
                  </div>
                </Field>
              </div>
            </section>

            <Separator />

            {/* ── Notes ─────────────────────────────────────────────────── */}
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
                  value={formData.notes ?? ''}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Visible to your team only"
                  maxLength={2000}
                  rows={3}
                  data-testid="orders-notes"
                />
              </Field>
              <Field
                id="deliveryNotes"
                label="Delivery instructions"
                error={errors.deliveryNotes}
              >
                <Textarea
                  id="deliveryNotes"
                  value={formData.deliveryNotes ?? ''}
                  onChange={(e) => setField('deliveryNotes', e.target.value)}
                  placeholder="Special instructions for the driver at delivery"
                  maxLength={2000}
                  rows={3}
                  data-testid="orders-delivery-notes"
                />
              </Field>
            </section>
          </div>
        </div>

        {/* ── Sticky footer ─────────────────────────────────────────────── */}
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
              {hasRoute && (
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <span className="font-medium text-foreground">{formData.pickupCity}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">{formData.deliveryCity}</span>
                  {formData.price > 0 && (
                    <span className="ml-1 font-semibold tabular-nums text-foreground">
                      {formatMoney(formData.price, formData.currency || 'USD')}
                    </span>
                  )}
                </span>
              )}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading || checkingDuplicate || noCustomers}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                data-testid="orders-submit-button"
              >
                {loading || checkingDuplicate ? 'Creating…' : 'Create Order'}
              </Button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={pastPickupConfirm}
          onOpenChange={setPastPickupConfirm}
          title="Pickup date is in the past"
          description="This order will appear overdue immediately. Create anyway?"
          confirmLabel="Create anyway"
          onConfirm={() => {
            setPastPickupConfirm(false);
            void submitOrder(acknowledgeDuplicateRef.current);
          }}
        />

        <ConfirmDialog
          open={duplicateConfirm}
          onOpenChange={setDuplicateConfirm}
          title="Possible duplicate order detected"
          description={
            duplicateMatches.length > 0
              ? `Similar order${duplicateMatches.length === 1 ? '' : 's'} created recently: ${duplicateMatches.map((m) => m.orderNumber).join(', ')}. You can still proceed.`
              : 'A similar order was created in the last 24 hours. You can still proceed.'
          }
          confirmLabel="Create anyway"
          onConfirm={() => {
            setDuplicateConfirm(false);
            acknowledgeDuplicateRef.current = true;
            void proceedAfterDuplicateCheck();
          }}
        >
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Possible duplicate order detected — review the matches above before continuing.
            </span>
          </div>
        </ConfirmDialog>
      </SheetContent>
    </Sheet>
  );
}
