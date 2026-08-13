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
import { Building2, CreditCard, MapPin, StickyNote, User } from 'lucide-react';
import { toast } from 'sonner';

const PAYMENT_TERMS: CustomerPaymentTerms[] = ['DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45'];

type Errors = Record<string, string>;

function stripEmptyOptionalFields(input: CreateCustomerInput): CreateCustomerInput {
  const cleaned = { ...input };
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'string' && value.trim() === '') {
      delete cleaned[key as keyof CreateCustomerInput];
    }
  }
  return cleaned;
}

const ALL_FIELDS = Object.keys(CUSTOMER_FIELD_SECTION);

const EMPTY_FORM: CreateCustomerInput = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  country: '',
  city: '',
  address: '',
  taxId: '',
  paymentTerms: 'NET_30',
  creditLimit: 0,
  deliveryNotes: '',
  internalNotes: '',
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
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);

  const setField = (field: keyof CreateCustomerInput, value: string | number | undefined) => {
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

  const handleSave = async () => {
    const all = validateCustomerFields(ALL_FIELDS, formData);
    setErrors(all);
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
      const result = await create(stripEmptyOptionalFields(formData));
      toast.success(`Customer "${result.companyName}" created`);
      onCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create customer'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New customer</SheetTitle>
          <SheetDescription className="text-xs">
            Account for orders, invoices, and dispatch relationships.
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
                    autoComplete="off"
                  />
                </Field>
                <Field
                  id="customerCode"
                  label="Customer code"
                  error={errors.customerCode}
                >
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

            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={User} title="Primary contact" errors={errorsBySection.contact} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="contactName" label="Contact name" required error={errors.contactName}>
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
                <Field id="phone" label="Phone" error={errors.phone} className="sm:col-span-2">
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
                  <Input
                    id="country"
                    value={formData.country ?? ''}
                    onChange={(e) => setField('country', e.target.value)}
                    className={cn('h-9', errors.country && 'border-destructive')}
                    maxLength={100}
                  />
                </Field>
                <Field id="city" label="City" error={errors.city}>
                  <Input
                    id="city"
                    value={formData.city ?? ''}
                    onChange={(e) => setField('city', e.target.value)}
                    className={cn('h-9', errors.city && 'border-destructive')}
                    maxLength={100}
                  />
                </Field>
                <Field id="address" label="Street address" error={errors.address} className="sm:col-span-2">
                  <Input
                    id="address"
                    value={formData.address ?? ''}
                    onChange={(e) => setField('address', e.target.value)}
                    className={cn('h-9', errors.address && 'border-destructive')}
                    maxLength={300}
                  />
                </Field>
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
                <Field id="paymentTerms" label="Payment terms">
                  <Select
                    value={formData.paymentTerms ?? 'NET_30'}
                    onValueChange={(v) => setField('paymentTerms', v as CustomerPaymentTerms)}
                  >
                    <SelectTrigger id="paymentTerms" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="creditLimit" label="Credit limit" error={errors.creditLimit}>
                  <Input
                    id="creditLimit"
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.creditLimit ?? 0}
                    onChange={(e) =>
                      setField('creditLimit', e.target.value === '' ? 0 : Number(e.target.value))
                    }
                    className={cn('h-9 font-mono', errors.creditLimit && 'border-destructive')}
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
                  className={cn(errors.deliveryNotes && 'border-destructive')}
                />
              </Field>
              <Field id="internalNotes" label="Internal notes" error={errors.internalNotes}>
                <Textarea
                  id="internalNotes"
                  value={formData.internalNotes ?? ''}
                  onChange={(e) => setField('internalNotes', e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className={cn(errors.internalNotes && 'border-destructive')}
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
            <Button type="button" onClick={() => void handleSave()} disabled={loading}>
              {loading ? 'Creating…' : 'Create customer'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
