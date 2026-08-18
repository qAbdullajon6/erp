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
} from '@/components/customers/customer-form-shared';
import { cn } from '@/lib/utils';
import { Building2, CreditCard, MapPin, StickyNote, User } from 'lucide-react';
import { toast } from 'sonner';

const PAYMENT_TERMS: CustomerPaymentTerms[] = ['DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45'];
const EDITABLE_STATUSES = ['ACTIVE', 'AT_RISK', 'INACTIVE'] as const;

type Errors = Record<string, string>;
type EditForm = UpdateCustomerInput & { creditLimit?: number };

function customerToForm(customer: Customer): EditForm {
  return {
    customerCode: customer.customerCode,
    companyName: customer.companyName,
    contactName: customer.contactName,
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    country: customer.country ?? '',
    city: customer.city ?? '',
    address: customer.address ?? '',
    taxId: customer.taxId ?? '',
    paymentTerms: customer.paymentTerms,
    creditLimit: parseFloat(customer.creditLimit) || 0,
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const archived = customer.status === 'ARCHIVED';

  useEffect(() => {
    if (open) {
      setFormData(customerToForm(customer));
      setErrors({});
    }
  }, [open, customer]);

  const setField = (field: keyof EditForm, value: string | number | undefined) => {
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
    const all: Errors = {};
    for (const f of ALL_FIELDS) {
      if (f === 'status' && archived) continue;
      const err = validateCustomerField(f, formData);
      if (err) all[f] = err;
    }
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
      contactName: formData.contactName,
      email: formData.email?.trim() ? formData.email : null,
      phone: formData.phone?.trim() ? formData.phone : null,
      country: formData.country?.trim() ? formData.country : null,
      city: formData.city?.trim() ? formData.city : null,
      address: formData.address?.trim() ? formData.address : null,
      taxId: formData.taxId?.trim() ? formData.taxId : null,
      paymentTerms: formData.paymentTerms,
      creditLimit: formData.creditLimit,
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
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
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
  );
}
