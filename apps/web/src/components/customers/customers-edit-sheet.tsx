'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  useUpdateCustomer,
  type Customer,
  type CustomerPaymentTerms,
  type UpdateCustomerInput,
} from '@/lib/api/customers';
import { describeError } from '@/lib/api/describe-error';
import {
  CUSTOMER_FIELD_SECTION,
  Field,
  SectionTitle,
  emptySectionCounts,
  validateCustomerField,
  validateCustomerFields,
} from '@/components/customers/customer-form-shared';
import { cn } from '@/lib/utils';
import { Building2, CheckCircle2, CreditCard, Loader2, MapPin, StickyNote, User } from 'lucide-react';
import { CountrySelect } from '@/components/shared/country-select';
import { CitySelect } from '@/components/shared/city-select';
import { AddressSearch } from '@/components/shared/address-search';
import { MapPicker } from '@/components/shared/map-picker';
import { geocodingAPI, type PlaceSuggestion } from '@/lib/api/geocoding';
import { CreditLimitField } from '@/components/customers/credit-limit-field';
import { PaymentTermsField } from '@/components/customers/payment-terms-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { toast } from 'sonner';

const EDITABLE_STATUSES = ['ACTIVE', 'AT_RISK', 'INACTIVE'] as const;

type Errors = Record<string, string>;
type GeoSource = 'none' | 'suggestion' | 'map';
type EditForm = UpdateCustomerInput & { creditLimit?: number | null; paymentTermsDays?: number | null; postalCode?: string | null; currency?: string | null; cityLat?: number | null; cityLng?: number | null };

function customerToForm(customer: Customer): EditForm {
  return {
    customerCode: customer.customerCode,
    companyName: customer.companyName,
    contactName: customer.contactName ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    country: customer.country ?? '',
    city: customer.city ?? '',
    cityLat: customer.lat ?? undefined,
    cityLng: customer.lng ?? undefined,
    address: customer.address ?? '',
    postalCode: customer.postalCode ?? '',
    taxId: customer.taxId ?? '',
    paymentTerms: customer.paymentTerms,
    paymentTermsDays: customer.paymentTermsDays ?? null,
    // null creditLimit = "No credit limit". parseFloat(null) = NaN → treat as null.
    creditLimit: customer.creditLimit != null ? parseFloat(customer.creditLimit) : null,
    currency: customer.currency ?? '',
    status: customer.status === 'ARCHIVED' ? undefined : customer.status,
    deliveryNotes: customer.deliveryNotes ?? '',
    internalNotes: customer.internalNotes ?? '',
  };
}

const ALL_FIELDS = Object.keys(CUSTOMER_FIELD_SECTION);

interface CustomersEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
}

export function CustomersEditSheet({ open, onOpenChange, customer }: CustomersEditSheetProps) {
  const { update, loading } = useUpdateCustomer();
  const [formData, setFormData] = useState<EditForm>(() => customerToForm(customer));
  const [errors, setErrors] = useState<Errors>({});
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const mapPickerActiveRef = useRef(false);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'done' | 'failed'>(
    () => (customer.lat != null ? 'done' : 'idle'),
  );
  // 'map' for pre-existing customers with coords; updated when user picks via AddressSearch or MapPicker
  const [geoSource, setGeoSource] = useState<GeoSource>(
    () => (customer.lat != null ? 'map' : 'none'),
  );
  const [addressSuggestion, setAddressSuggestion] = useState<PlaceSuggestion | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const archived = customer.status === 'ARCHIVED';

  useEffect(() => {
    if (open) {
      setFormData(customerToForm(customer));
      setErrors({});
      setGeoState(customer.lat != null ? 'done' : 'idle');
      setGeoSource(customer.lat != null ? 'map' : 'none');
      setAddressSuggestion(null);
    }
  }, [open, customer]);

  const setField = (field: keyof EditForm, value: string | number | null | undefined) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setErrors((prev) => {
      const out = { ...prev };
      const err = validateCustomerField(field, next);
      if (err) out[field] = err;
      else delete out[field];
      return out;
    });
  };

  const handleAddressSuggestion = (s: PlaceSuggestion | null) => {
    setAddressSuggestion(s);
    if (s) {
      setFormData((prev) => ({
        ...prev,
        address: s.name,
        postalCode: s.postalCode ?? null,
        cityLat: s.lat,
        cityLng: s.lng,
      }));
      setGeoState('done');
      setGeoSource('suggestion');
    } else {
      setFormData((prev) => ({ ...prev, address: null, postalCode: null, cityLat: null, cityLng: null }));
      setGeoState('idle');
      setGeoSource('none');
    }
  };

  const mapButtonLabel = () => {
    if (geoSource === 'map') return 'Location confirmed — Move pin';
    if (geoSource === 'suggestion') return 'Verify location on map';
    return 'Pick location on map';
  };

  const errorsBySection = useMemo(() => {
    const counts = emptySectionCounts();
    for (const field of Object.keys(errors)) {
      const section = CUSTOMER_FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const handleSave = async () => {
    const fieldsToValidate = ALL_FIELDS.filter((f) => !(f === 'status' && archived));
    const all = validateCustomerFields(fieldsToValidate, formData);
    setErrors(all);
    if (Object.keys(all).length > 0) {
      toast.error('Fix the highlighted fields');
      const first = ALL_FIELDS.find((f) => all[f]);
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector(`[data-field="${first}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    const payload: UpdateCustomerInput = {
      customerCode: formData.customerCode,
      companyName: formData.companyName,
      contactName: formData.contactName?.trim() ? formData.contactName : null,
      email: formData.email?.trim() ? formData.email : null,
      phone: formData.phone?.trim() ? formData.phone : null,
      country: formData.country?.trim() ? formData.country : null,
      city: formData.city?.trim() ? formData.city : null,
      // Always send current coords so the backend can set/clear them accurately.
      cityLat: formData.cityLat ?? null,
      cityLng: formData.cityLng ?? null,
      address: formData.address?.trim() ? formData.address : null,
      postalCode: formData.postalCode?.trim() ? formData.postalCode : null,
      taxId: formData.taxId?.trim() ? formData.taxId : null,
      paymentTerms: formData.paymentTerms,
      // Only send paymentTermsDays for CUSTOM terms; backend always clears it for others.
      // Also omit the NaN sentinel (validation should have caught it).
      paymentTermsDays: formData.paymentTerms === 'CUSTOM' &&
        !(typeof formData.paymentTermsDays === 'number' && Number.isNaN(formData.paymentTermsDays))
        ? formData.paymentTermsDays
        : undefined,
      // NaN is a validation sentinel — omit from payload (validation should have caught it).
      creditLimit: typeof formData.creditLimit === 'number' && Number.isNaN(formData.creditLimit)
        ? undefined
        : formData.creditLimit,
      currency: formData.currency?.trim() ? formData.currency : null,
      deliveryNotes: formData.deliveryNotes?.trim() ? formData.deliveryNotes : null,
      internalNotes: formData.internalNotes?.trim() ? formData.internalNotes : null,
    };
    if (!archived && formData.status) {
      payload.status = formData.status;
    }

    try {
      await update(customer.id, payload);
      toast.success('Customer updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update customer'));
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]"
        onInteractOutside={(e) => { if (mapPickerActiveRef.current) e.preventDefault(); }}
        onFocusOutside={(e) => { if (mapPickerActiveRef.current) e.preventDefault(); }}
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Edit {customer.companyName}</SheetTitle>
          <SheetDescription className="text-xs">
            {customer.customerCode}
            {archived ? ' · Archived accounts are restored from the detail page.' : ''}
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">
            <section className="space-y-3">
              <SectionTitle icon={Building2} title="Company" errors={errorsBySection.company} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="companyName" label="Company name" required error={errors.companyName}>
                  <Input
                    id="companyName"
                    value={formData.companyName ?? ''}
                    onChange={(e) => setField('companyName', e.target.value)}
                    className={cn('h-9', errors.companyName && 'border-destructive')}
                    maxLength={200}
                  />
                </Field>
                <Field id="customerCode" label="Customer code" error={errors.customerCode}>
                  <Input
                    id="customerCode"
                    value={formData.customerCode ?? ''}
                    onChange={(e) => setField('customerCode', e.target.value)}
                    className={cn('h-9 font-mono', errors.customerCode && 'border-destructive')}
                    maxLength={50}
                  />
                </Field>
                {!archived && (
                  <Field id="status" label="Status">
                    <Select
                      value={formData.status ?? 'ACTIVE'}
                      onValueChange={(v) =>
                        setField('status', v as (typeof EDITABLE_STATUSES)[number])
                      }
                    >
                      <SelectTrigger id="status" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITABLE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={User} title="Contact" errors={errorsBySection.contact} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="contactName" label="Contact name (optional)" error={errors.contactName}>
                  <Input
                    id="contactName"
                    value={formData.contactName ?? ''}
                    onChange={(e) => setField('contactName', e.target.value)}
                    className={cn('h-9', errors.contactName && 'border-destructive')}
                    maxLength={200}
                  />
                </Field>
                <Field id="email" label="Email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email ?? ''}
                    onChange={(e) => setField('email', e.target.value)}
                    className={cn('h-9', errors.email && 'border-destructive')}
                  />
                </Field>
                <Field id="phone" label="Phone" error={errors.phone}>
                  <Input
                    id="phone"
                    value={formData.phone ?? ''}
                    onChange={(e) => setField('phone', e.target.value)}
                    className={cn('h-9', errors.phone && 'border-destructive')}
                    maxLength={50}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={MapPin} title="Address" errors={errorsBySection.address} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="country" label="Country" error={errors.country}>
                  <CountrySelect
                    id="country"
                    value={formData.country?.trim() ? formData.country : null}
                    onChange={(code) => {
                      const next = { ...formData, country: code ?? '', city: '', cityLat: null, cityLng: null, address: null, postalCode: null };
                      setFormData(next);
                      setGeoState('idle');
                      setGeoSource('none');
                      setAddressSuggestion(null);
                      setErrors((prev) => {
                        const out = { ...prev };
                        const countryErr = prev.country ? validateCustomerField('country', next) : null;
                        if (countryErr) out.country = countryErr; else delete out.country;
                        delete out.city;
                        return out;
                      });
                    }}
                    hasError={Boolean(errors.country)}
                  />
                </Field>
                <Field id="city" label="City" error={errors.city}>
                  <CitySelect
                    id="city"
                    countryCode={formData.country?.trim() ? formData.country : null}
                    value={formData.city?.trim() ? formData.city : null}
                    onChange={(city, coords) => {
                      setFormData((prev) => ({
                        ...prev,
                        city: city ?? '',
                        cityLat: coords?.lat ?? null,
                        cityLng: coords?.lng ?? null,
                        address: null,
                        postalCode: null,
                      }));
                      setGeoState('idle');
                      setGeoSource('none');
                      setAddressSuggestion(null);
                      setErrors((prev) => { const out = { ...prev }; delete out.city; return out; });
                    }}
                    hasError={Boolean(errors.city)}
                  />
                </Field>
                {/* ── Street address search + map flow ── */}
                <div className="sm:col-span-2 space-y-2.5">
                  <AddressSearch
                    countryCode={formData.country?.trim() ? formData.country : null}
                    value={addressSuggestion}
                    onChange={handleAddressSuggestion}
                    disabled={!formData.country?.trim()}
                  />

                  <button
                    type="button"
                    onClick={() => { mapPickerActiveRef.current = true; setMapPickerOpen(true); }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      geoSource === 'map'
                        ? 'border-success/30 bg-success/5 text-success hover:bg-success/10'
                        : geoSource === 'suggestion'
                          ? 'border-brand/30 bg-brand/5 text-brand hover:bg-brand/10'
                          : 'border-border/60 text-muted-foreground hover:border-brand/40 hover:text-brand',
                    )}
                  >
                    {geoSource === 'map'
                      ? <CheckCircle2 className="h-3.5 w-3.5" />
                      : <MapPin className="h-3.5 w-3.5" />
                    }
                    {mapButtonLabel()}
                  </button>

                  {geoState === 'loading' && (
                    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Detecting address…</span>
                    </div>
                  )}
                  {geoState === 'done' && (
                    <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5 space-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {geoSource === 'map' ? 'Confirmed address' : 'Selected address'}
                      </p>
                      <p className="text-sm text-foreground">
                        {formData.address?.trim()
                          ? formData.address
                          : <span className="italic text-muted-foreground">No street address for this location</span>
                        }
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formData.postalCode?.trim()
                          ? `Postal code: ${formData.postalCode}`
                          : <span className="italic">Postal code not available</span>
                        }
                      </p>
                    </div>
                  )}
                  {geoState === 'failed' && (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                      Could not detect address. Try moving the pin to a different location.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={CreditCard} title="Credit & billing" errors={errorsBySection.credit} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="taxId" label="Tax ID" error={errors.taxId}>
                  <Input
                    id="taxId"
                    value={formData.taxId ?? ''}
                    onChange={(e) => setField('taxId', e.target.value)}
                    className={cn('h-9', errors.taxId && 'border-destructive')}
                    maxLength={100}
                  />
                </Field>
                <PaymentTermsField
                  paymentTerms={formData.paymentTerms ?? 'NET_30'}
                  paymentTermsDays={formData.paymentTermsDays}
                  onPaymentTermsChange={(terms) => {
                    const next = {
                      ...formData,
                      paymentTerms: terms,
                      paymentTermsDays: terms !== 'CUSTOM' ? null : formData.paymentTermsDays,
                    };
                    setFormData(next);
                    setErrors((prev) => {
                      const out = { ...prev };
                      const err = validateCustomerField('paymentTerms', next);
                      if (err) out.paymentTerms = err; else delete out.paymentTerms;
                      if (terms !== 'CUSTOM') delete out.paymentTermsDays;
                      return out;
                    });
                  }}
                  onPaymentTermsDaysChange={(days) => {
                    setFormData((prev) => ({ ...prev, paymentTermsDays: days }));
                    setErrors((prev) => {
                      const out = { ...prev };
                      if (days != null && !Number.isNaN(days) && days < 0) {
                        out.paymentTermsDays = 'Must be 0 or more';
                      } else if (days != null && !Number.isNaN(days) && !Number.isInteger(days)) {
                        out.paymentTermsDays = 'Must be a whole number';
                      } else {
                        delete out.paymentTermsDays;
                      }
                      return out;
                    });
                  }}
                  daysError={errors.paymentTermsDays}
                />
                <CreditLimitField
                  value={formData.creditLimit ?? null}
                  onChange={(v) => setField('creditLimit', v)}
                  error={errors.creditLimit}
                />
                <Field id="currency" label="Billing currency" error={errors.currency}>
                  <CurrencySelect
                    id="currency"
                    value={formData.currency?.trim() || null}
                    onChange={(code) => setField('currency', code ?? '')}
                    hasError={Boolean(errors.currency)}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5 pb-2">
              <SectionTitle icon={StickyNote} title="Notes" errors={errorsBySection.notes} />
              <Field id="deliveryNotes" label="Delivery notes" error={errors.deliveryNotes}>
                <Textarea
                  id="deliveryNotes"
                  value={formData.deliveryNotes ?? ''}
                  onChange={(e) => setField('deliveryNotes', e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </Field>
              <Field id="internalNotes" label="Internal notes" error={errors.internalNotes}>
                <Textarea
                  id="internalNotes"
                  value={formData.internalNotes ?? ''}
                  onChange={(e) => setField('internalNotes', e.target.value)}
                  rows={3}
                  maxLength={2000}
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
            <Button type="button" onClick={() => void handleSave()} disabled={loading || archived}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    {/* MapPicker is outside the Sheet to avoid nested Radix overlay conflicts */}
    <MapPicker
      open={mapPickerOpen}
      onClose={() => {
        mapPickerActiveRef.current = true;
        setMapPickerOpen(false);
        setTimeout(() => { mapPickerActiveRef.current = false; }, 300);
      }}
      initialCoords={
        formData.cityLat != null && formData.cityLng != null
          ? { lat: formData.cityLat, lng: formData.cityLng }
          : null
      }
      onConfirm={({ lat, lng }) => {
        mapPickerActiveRef.current = true;
        setFormData((prev) => ({ ...prev, cityLat: lat, cityLng: lng, address: null, postalCode: null }));
        setAddressSuggestion(null);
        setGeoState('loading');
        setGeoSource('none');
        geocodingAPI.reverseGeocode({ lat, lng }).then((result) => {
          setFormData((prev) => ({
            ...prev,
            address: result.street ?? null,
            postalCode: result.postalCode ?? null,
          }));
          setGeoState('done');
          setGeoSource('map');
        }).catch(() => {
          setGeoState('failed');
          setGeoSource('none');
        }).finally(() => {
          setTimeout(() => { mapPickerActiveRef.current = false; }, 200);
        });
      }}
    />
    </>
  );
}
