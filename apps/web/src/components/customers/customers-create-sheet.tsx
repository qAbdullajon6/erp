'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  useCreateCustomer,
  type CreateCustomerInput,
  type Customer,
  type CustomerPaymentTerms,
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
import { Building2, CheckCircle2, ChevronDown, ChevronRight, CreditCard, Loader2, MapPin, User } from 'lucide-react';
import { CountrySelect } from '@/components/shared/country-select';
import { CitySelect } from '@/components/shared/city-select';
import { AddressSearch } from '@/components/shared/address-search';
import { MapPicker } from '@/components/shared/map-picker';
import { geocodingAPI, type PlaceSuggestion } from '@/lib/api/geocoding';
import { CreditLimitField } from '@/components/customers/credit-limit-field';
import { PaymentTermsField } from '@/components/customers/payment-terms-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { toast } from 'sonner';

type Errors = Record<string, string>;
type GeoSource = 'none' | 'suggestion' | 'map';

function stripEmptyOptionalFields(input: CreateCustomerInput): CreateCustomerInput {
  const cleaned = { ...input };
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'string' && value.trim() === '') {
      delete cleaned[key as keyof CreateCustomerInput];
    }
  }
  // NaN is a validation sentinel — never send it to the API.
  if (typeof cleaned.creditLimit === 'number' && Number.isNaN(cleaned.creditLimit)) {
    delete cleaned.creditLimit;
  }
  // Only send paymentTermsDays when CUSTOM; backend clears it automatically for other terms.
  // Also omit NaN (sentinel for "required but not yet entered").
  if (
    cleaned.paymentTerms !== 'CUSTOM' ||
    (typeof cleaned.paymentTermsDays === 'number' && Number.isNaN(cleaned.paymentTermsDays))
  ) {
    delete cleaned.paymentTermsDays;
  }
  return cleaned;
}

const CORE_FIELDS = ['companyName', 'customerCode', 'contactName', 'email', 'phone'];
const ADDRESS_FIELDS = ['country', 'city'];
const CREDIT_FIELDS = ['taxId', 'paymentTerms', 'paymentTermsDays', 'creditLimit', 'currency'];

const EMPTY_FORM: CreateCustomerInput = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  country: '',
  city: '',
  address: '',
  postalCode: '',
  taxId: '',
  paymentTerms: 'NET_30',
  // null = "No credit limit" — the new default for fresh customers.
  creditLimit: null,
  currency: '',
};

interface CustomersCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
}

export function CustomersCreateSheet({ open, onOpenChange, onCreated }: CustomersCreateSheetProps) {
  const { create, loading } = useCreateCustomer();
  const [formData, setFormData] = useState<CreateCustomerInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [addressOpen, setAddressOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const mapPickerActiveRef = useRef(false);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [geoSource, setGeoSource] = useState<GeoSource>('none');
  const [addressSuggestion, setAddressSuggestion] = useState<PlaceSuggestion | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY_FORM);
      setErrors({});
      setAddressOpen(false);
      setMapPickerOpen(false);
      setGeoState('idle');
      setGeoSource('none');
      setAddressSuggestion(null);
      setCreditOpen(false);
    }
  }, [open]);

  const setField = (field: keyof CreateCustomerInput, value: string | number | null | undefined) => {
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

  const errorsBySection = useMemo(() => {
    const counts = emptySectionCounts();
    for (const field of Object.keys(errors)) {
      const section = CUSTOMER_FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const handleAddressSuggestion = (s: PlaceSuggestion | null) => {
    setAddressSuggestion(s);
    if (s) {
      setFormData((prev) => ({
        ...prev,
        address: s.name,
        postalCode: s.postalCode ?? '',
        cityLat: s.lat,
        cityLng: s.lng,
      }));
      setGeoState('done');
      setGeoSource('suggestion');
    } else {
      setFormData((prev) => ({
        ...prev,
        address: '',
        postalCode: '',
        cityLat: undefined,
        cityLng: undefined,
      }));
      setGeoState('idle');
      setGeoSource('none');
    }
  };

  const mapButtonLabel = () => {
    if (geoSource === 'map') return 'Location confirmed — Move pin';
    if (geoSource === 'suggestion') return 'Verify location on map';
    return 'Pick location on map';
  };

  const handleSave = async () => {
    const fieldsToValidate = [
      ...CORE_FIELDS,
      ...(addressOpen ? ADDRESS_FIELDS : []),
      ...(creditOpen ? CREDIT_FIELDS : []),
    ];
    const all = validateCustomerFields(fieldsToValidate, formData);
    setErrors(all);
    if (Object.keys(all).length > 0) {
      toast.error('Fix the highlighted fields');
      const firstField = fieldsToValidate.find((f) => all[f]);
      if (firstField) {
        const section = CUSTOMER_FIELD_SECTION[firstField];
        if (section === 'address') setAddressOpen(true);
        if (section === 'credit') setCreditOpen(true);
      }
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector(`[data-field="${firstField}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el?.querySelector('input,textarea,button') as HTMLElement | null)?.focus?.();
      });
      return;
    }

    try {
      const result = await create(stripEmptyOptionalFields(formData));
      toast.success(`Customer "${result.companyName}" created`);
      onCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create customer'));
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[620px]"
        onInteractOutside={(e) => { if (mapPickerActiveRef.current) e.preventDefault(); }}
        onFocusOutside={(e) => { if (mapPickerActiveRef.current) e.preventDefault(); }}
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New customer</SheetTitle>
          <SheetDescription className="text-xs">
            Account for orders, invoices, and dispatch relationships.
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">

            {/* ── Company ── */}
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
                    autoFocus
                    autoComplete="off"
                  />
                </Field>
                <Field id="customerCode" label="Customer code" error={errors.customerCode}>
                  <Input
                    id="customerCode"
                    value={formData.customerCode ?? ''}
                    onChange={(e) => setField('customerCode', e.target.value)}
                    placeholder="Auto-generated if empty"
                    className={cn('h-9 font-mono', errors.customerCode && 'border-destructive')}
                    maxLength={50}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </section>

            {/* ── Contact ── */}
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
                    placeholder="Add later if unknown"
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

            {/* ── Address (collapsible) ── */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle
                icon={MapPin}
                title="Address"
                errors={errorsBySection.address}
                action={
                  <button
                    type="button"
                    onClick={() => setAddressOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {addressOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {addressOpen ? 'Hide' : 'Add address'}
                  </button>
                }
              />
              {addressOpen && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field id="country" label="Country" error={errors.country}>
                    <CountrySelect
                      id="country"
                      value={formData.country ?? null}
                      onChange={(code) => {
                        const next = {
                          ...formData,
                          country: code ?? '',
                          city: '',
                          cityLat: undefined,
                          cityLng: undefined,
                          address: '',
                          postalCode: '',
                        };
                        setGeoState('idle');
                        setGeoSource('none');
                        setAddressSuggestion(null);
                        setFormData(next);
                        setErrors((prev) => {
                          const out = { ...prev };
                          const err = prev.country ? validateCustomerField('country', next) : null;
                          if (err) out.country = err; else delete out.country;
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
                      countryCode={formData.country ?? null}
                      value={formData.city ?? null}
                      onChange={(city, coords) => {
                        setFormData((prev) => ({
                          ...prev,
                          city: city ?? '',
                          cityLat: coords?.lat,
                          cityLng: coords?.lng,
                          address: '',
                          postalCode: '',
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
                      countryCode={formData.country ?? null}
                      value={addressSuggestion}
                      onChange={handleAddressSuggestion}
                      disabled={!formData.country}
                    />

                    {/* Map button — label changes with location source */}
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

                    {/* Status feedback */}
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
              )}
            </section>

            {/* ── Credit & Billing (collapsible) ── */}
            <section className="space-y-3 border-t border-border/60 pt-5 pb-2">
              <SectionTitle
                icon={CreditCard}
                title="Credit & billing"
                errors={errorsBySection.credit}
                action={
                  <button
                    type="button"
                    onClick={() => setCreditOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {creditOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {creditOpen ? 'Hide' : 'Set credit & billing'}
                  </button>
                }
              />
              {creditOpen && (
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
                      // Single atomic update avoids stale-closure overwrite when
                      // paymentTerms and paymentTermsDays change together.
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
                      // Functional updater so this doesn't overwrite the concurrent
                      // onPaymentTermsChange update (both fire inside handleTermsChange).
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
              )}
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading}>
              {loading ? 'Creating…' : 'Create customer'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    {/* MapPicker outside the Sheet to avoid nested Radix overlay conflicts */}
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
        setFormData((prev) => ({ ...prev, cityLat: lat, cityLng: lng, address: '', postalCode: '' }));
        setAddressSuggestion(null);
        setGeoState('loading');
        setGeoSource('none');
        geocodingAPI.reverseGeocode({ lat, lng }).then((result) => {
          setFormData((prev) => ({
            ...prev,
            address: result.street ?? '',
            postalCode: result.postalCode ?? '',
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
