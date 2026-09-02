'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  useUpdateOrder,
  type Order,
  type UpdateOrderInput,
  type OrderStopInput,
} from '@/lib/api/orders';
import { type PlaceSuggestion } from '@/lib/api/geocoding';
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
} from '@/components/orders/intermediate-stops-section';
import { ArrowRight, Check, MapPin, Package, StickyNote, Truck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

// Edit never changes the customer, so its section set is the shared one minus 'customer'.
type SectionKey = Exclude<OrderSectionKey, 'customer'>;

const FIELD_SECTION: Record<string, SectionKey> = {
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
    pickupPostalCode: order.pickupPostalCode ?? undefined,
    pickupCountryCode: order.pickupCountryCode ?? undefined,
    pickupPlaceName: order.pickupPlaceName ?? undefined,
    pickupContactName: order.pickupContactName ?? undefined,
    pickupContactPhone: order.pickupContactPhone ?? undefined,
    pickupInstructions: order.pickupInstructions ?? undefined,
    pickupWindowStart: order.pickupWindowStart ?? undefined,
    pickupWindowEnd: order.pickupWindowEnd ?? undefined,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: order.deliveryCity,
    deliveryDate: order.deliveryDate.slice(0, 10),
    deliveryPostalCode: order.deliveryPostalCode ?? undefined,
    deliveryCountryCode: order.deliveryCountryCode ?? undefined,
    deliveryPlaceName: order.deliveryPlaceName ?? undefined,
    deliveryContactName: order.deliveryContactName ?? undefined,
    deliveryContactPhone: order.deliveryContactPhone ?? undefined,
    deliveryInstructions: order.deliveryInstructions ?? undefined,
    deliveryWindowStart: order.deliveryWindowStart ?? undefined,
    deliveryWindowEnd: order.deliveryWindowEnd ?? undefined,
    pickupLat: order.pickupLat != null ? Number(order.pickupLat) : undefined,
    pickupLng: order.pickupLng != null ? Number(order.pickupLng) : undefined,
    deliveryLat: order.deliveryLat != null ? Number(order.deliveryLat) : undefined,
    deliveryLng: order.deliveryLng != null ? Number(order.deliveryLng) : undefined,
    cargoDescription: order.cargoDescription,
    cargoWeightKg: order.cargoWeightKg ? Number(order.cargoWeightKg) : undefined,
    cargoVolumeM3: order.cargoVolumeM3 ? Number(order.cargoVolumeM3) : undefined,
    price: Number(order.price),
    currency: order.currency,
    notes: order.notes ?? '',
    deliveryNotes: order.deliveryNotes ?? '',
  };
}

function buildInitialSuggestion(
  address: string,
  city?: string | null,
  postalCode?: string | null,
): PlaceSuggestion {
  return {
    id: 'existing',
    name: address,
    city: city ?? null,
    postalCode: postalCode ?? null,
    region: null,
    countryName: null,
    placeName: null,
    lat: 0,
    lng: 0,
  };
}

interface OrdersEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  onUpdated?: () => void;
}

function orderStopsToInput(order: Order): OrderStopInput[] {
  return (order.orderStops ?? []).map((s) => ({
    address: s.address,
    city: s.city,
    postalCode: s.postalCode ?? undefined,
    countryCode: s.countryCode ?? undefined,
    placeName: s.placeName ?? undefined,
    contactName: s.contactName ?? undefined,
    contactPhone: s.contactPhone ?? undefined,
    instructions: s.instructions ?? undefined,
    windowStart: s.windowStart ?? undefined,
    windowEnd: s.windowEnd ?? undefined,
  }));
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────

function SectionTitle({
  icon: Icon,
  title,
  errorCount,
}: {
  icon: typeof MapPin;
  title: string;
  errorCount: number;
}) {
  return (
    <div className="flex items-center gap-2">
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

function toTimeValue(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(11, 16);
}

interface StopPanelProps {
  prefix: 'pickup' | 'delivery';
  errorCount: number;
  formData: UpdateOrderInput;
  errors: Errors;
  onFieldChange: (field: keyof UpdateOrderInput, value: string | number | undefined) => void;
  onFieldsBatch: (updates: Partial<UpdateOrderInput>) => void;
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

  const fn = (suffix: string) => `${prefix}${suffix}` as keyof UpdateOrderInput;

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
    onFieldsBatch(u as Partial<UpdateOrderInput>);
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
    onFieldsBatch(u as Partial<UpdateOrderInput>);
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
      // Persist geocoded coords so they're included in the save payload.
      if (s.lat && s.lng) {
        u[`${prefix}Lat`] = s.lat;
        u[`${prefix}Lng`] = s.lng;
      }
      onFieldsBatch(u as Partial<UpdateOrderInput>);
      onMapCoordsChange({ lat: s.lat, lng: s.lng });
      onMapConfirmedChange(false);
    } else {
      const u: Record<string, unknown> = {
        [`${prefix}Address`]: '',
        [`${prefix}PostalCode`]: undefined,
        [`${prefix}Lat`]: undefined,
        [`${prefix}Lng`]: undefined,
      };
      onFieldsBatch(u as Partial<UpdateOrderInput>);
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
      <SectionTitle icon={Icon} title={stopLabel} errorCount={errorCount} />

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
        <CitySelect
          id={fn('City')}
          countryCode={countryCode || null}
          value={city || null}
          onChange={handleCityChange}
          hasError={Boolean(errors[fn('City')])}
          placeholder={countryCode ? 'Select city…' : 'Select country first'}
        />
      </Field>

      {/* Search address */}
      <Field id={fn('Address')} label="Search address" required error={errors[fn('Address')]}>
        <AddressSearch
          id={fn('Address')}
          countryCode={countryCode || null}
          value={addressSuggestion}
          onChange={handleAddressSuggestion}
          disabled={!city}
          placeholder={city ? 'Search street address, place, or ZIP…' : 'Select city first'}
          hasError={Boolean(errors[fn('Address')])}
        />
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
              const latKey = `${prefix}Lat` as keyof UpdateOrderInput;
              const lngKey = `${prefix}Lng` as keyof UpdateOrderInput;
              onFieldsBatch({ [latKey]: coords.lat, [lngKey]: coords.lng } as Partial<UpdateOrderInput>);
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

// ─── OrdersEditSheet ──────────────────────────────────────────────────────────

/// Edit uses the same right Sheet pattern as create — list/detail stay visible.
export function OrdersEditSheet({ open, onOpenChange, order, onUpdated }: OrdersEditSheetProps) {
  const { update, loading } = useUpdateOrder();
  const [formData, setFormData] = useState<UpdateOrderInput>(() => orderToForm(order));
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [stops, setStops] = useState<OrderStopInput[]>(() => orderStopsToInput(order));
  const [stopErrors, setStopErrors] = useState<Record<number, Record<string, string>>>({});
  const [stopTouched, setStopTouched] = useState<Record<number, Set<string>>>({});
  const [discardOpen, setDiscardOpen] = useState(false);

  // Address geocoding state — not sent to API, only used for UI flow
  const [pickupSuggestion, setPickupSuggestion] = useState<PlaceSuggestion | null>(() =>
    order.pickupAddress
      ? buildInitialSuggestion(order.pickupAddress, order.pickupCity, order.pickupPostalCode)
      : null,
  );
  const [deliverySuggestion, setDeliverySuggestion] = useState<PlaceSuggestion | null>(() =>
    order.deliveryAddress
      ? buildInitialSuggestion(
          order.deliveryAddress,
          order.deliveryCity,
          order.deliveryPostalCode,
        )
      : null,
  );
  const [pickupMapCoords, setPickupMapCoords] = useState<MapPickerCoords | null>(null);
  const [deliveryMapCoords, setDeliveryMapCoords] = useState<MapPickerCoords | null>(null);
  const [pickupMapConfirmed, setPickupMapConfirmed] = useState(false);
  const [deliveryMapConfirmed, setDeliveryMapConfirmed] = useState(false);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const [deliveryMapOpen, setDeliveryMapOpen] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef(JSON.stringify(orderToForm(order)));
  const stopsBaselineRef = useRef(JSON.stringify(orderStopsToInput(order)));
  const leaveConfirmedRef = useRef(false);

  useEffect(() => {
    if (open) {
      const next = orderToForm(order);
      const nextStops = orderStopsToInput(order);
      setFormData(next);
      baselineRef.current = JSON.stringify(next);
      setStops(nextStops);
      stopsBaselineRef.current = JSON.stringify(nextStops);
      setErrors({});
      setTouched(new Set());
      setStopErrors({});
      setStopTouched({});
      setDiscardOpen(false);
      leaveConfirmedRef.current = false;
      // Re-initialise address suggestions from order data
      setPickupSuggestion(
        order.pickupAddress
          ? buildInitialSuggestion(order.pickupAddress, order.pickupCity, order.pickupPostalCode)
          : null,
      );
      setDeliverySuggestion(
        order.deliveryAddress
          ? buildInitialSuggestion(
              order.deliveryAddress,
              order.deliveryCity,
              order.deliveryPostalCode,
            )
          : null,
      );
      setPickupMapCoords(null);
      setDeliveryMapCoords(null);
      setPickupMapConfirmed(false);
      setDeliveryMapConfirmed(false);
      setPickupMapOpen(false);
      setDeliveryMapOpen(false);
    }
  }, [open, order]);

  const isDirty =
    open &&
    (JSON.stringify(formData) !== baselineRef.current ||
      JSON.stringify(stops) !== stopsBaselineRef.current);

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
  // Intentionally does NOT add fields to `touched` so programmatic clears never
  // show premature errors.
  const setFields = (updates: Partial<UpdateOrderInput>) => {
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

  const hasRoute = formData.pickupCity && formData.deliveryCity;

  const handleSave = async () => {
    const all = validateAll(formData);
    setErrors(all);
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

    if (Object.keys(all).length > 0 || hasStopErrors) {
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
      const payload: UpdateOrderInput = { ...formData, orderStops: stops };
      await update(order.id, payload);
      baselineRef.current = JSON.stringify(formData);
      stopsBaselineRef.current = JSON.stringify(stops);
      toast.success('Order updated');
      onUpdated?.();
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
          requestClose();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-[820px]"
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
                <SectionTitle icon={Package} title="Cargo" errorCount={errorsBySection.cargo} />
                <Field
                  id="edit-cargoDescription"
                  label="Description"
                  required
                  error={errors.cargoDescription}
                >
                  <Textarea
                    id="edit-cargoDescription"
                    value={formData.cargoDescription ?? ''}
                    onChange={(e) => setField('cargoDescription', e.target.value)}
                    placeholder="What is being transported — e.g. Ceramic tiles, 12 pallets"
                    maxLength={2000}
                    rows={2}
                    aria-invalid={Boolean(errors.cargoDescription)}
                    className={cn(errors.cargoDescription && 'border-destructive')}
                  />
                </Field>
                <div className="grid max-w-md grid-cols-2 gap-3">
                  <Field
                    id="edit-cargoWeightKg"
                    label="Weight (kg)"
                    error={errors.cargoWeightKg}
                  >
                    <Input
                      id="edit-cargoWeightKg"
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
                    />
                  </Field>
                  <Field
                    id="edit-cargoVolumeM3"
                    label="Volume (m³)"
                    error={errors.cargoVolumeM3}
                  >
                    <Input
                      id="edit-cargoVolumeM3"
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
                    />
                  </Field>
                </div>
              </section>

              <Separator />

              {/* ── Pricing ───────────────────────────────────────────────── */}
              <section className="space-y-3">
                <SectionTitle
                  icon={Wallet}
                  title="Pricing"
                  errorCount={errorsBySection.pricing}
                />
                <div className="grid max-w-md grid-cols-[1fr_160px] gap-3">
                  <Field
                    id="edit-price"
                    label="Customer price"
                    required
                    error={errors.price}
                  >
                    <Input
                      id="edit-price"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.price ?? ''}
                      onChange={(e) =>
                        setField('price', e.target.value ? parseFloat(e.target.value) : 0)
                      }
                      aria-invalid={Boolean(errors.price)}
                      className={cn('h-9', errors.price && 'border-destructive')}
                    />
                  </Field>
                  <Field id="edit-currency" label="Currency" error={errors.currency}>
                    <CurrencySelect
                      id="edit-currency"
                      value={formData.currency ?? 'USD'}
                      onChange={(v) => setField('currency', v ?? 'USD')}
                      hasError={Boolean(errors.currency)}
                    />
                  </Field>
                </div>
              </section>

              <Separator />

              {/* ── Notes ─────────────────────────────────────────────────── */}
              <section className="space-y-3 pb-2">
                <SectionTitle
                  icon={StickyNote}
                  title="Notes"
                  errorCount={errorsBySection.notes}
                />
                <Field id="edit-notes" label="Internal notes" error={errors.notes}>
                  <Textarea
                    id="edit-notes"
                    value={formData.notes ?? ''}
                    onChange={(e) => setField('notes', e.target.value)}
                    placeholder="Visible to your team only"
                    maxLength={2000}
                    rows={3}
                  />
                </Field>
                <Field
                  id="edit-deliveryNotes"
                  label="Delivery instructions"
                  error={errors.deliveryNotes}
                >
                  <Textarea
                    id="edit-deliveryNotes"
                    value={formData.deliveryNotes ?? ''}
                    onChange={(e) => setField('deliveryNotes', e.target.value)}
                    placeholder="Special instructions for the driver at delivery"
                    maxLength={2000}
                    rows={3}
                  />
                </Field>
              </section>
            </div>
          </div>

          {/* ── Sticky footer ─────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={requestClose} disabled={loading}>
                Cancel
              </Button>
              <div className="flex items-center gap-3">
                {hasRoute && (
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <span className="font-medium text-foreground">{formData.pickupCity}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium text-foreground">{formData.deliveryCity}</span>
                    {(formData.price ?? 0) > 0 && (
                      <span className="ml-1 font-semibold tabular-nums text-foreground">
                        {formatMoney(formData.price ?? 0, formData.currency || 'USD')}
                      </span>
                    )}
                  </span>
                )}
                <Button type="button" onClick={handleSave} disabled={loading}>
                  {loading ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
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
