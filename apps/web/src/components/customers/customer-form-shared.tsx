'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/// Shared between CustomersCreateSheet and CustomersEditSheet — both sheets
/// validate and render the same account fields (create additionally has
/// `customerCode` free-typed with an "auto-generated if empty" placeholder;
/// edit adds `status`). Previously each file hand-copied its own Field,
/// validateField, and SectionTitle, which meant a validation-rule change made
/// in one sheet and not the other was an easy miss — the same duplication
/// Orders' create/edit sheets had before order-form-shared.tsx.

export type CustomerSectionKey = 'company' | 'contact' | 'address' | 'credit' | 'notes';

export const CUSTOMER_FIELD_SECTION: Record<string, CustomerSectionKey> = {
  customerCode: 'company',
  companyName: 'company',
  status: 'company',
  contactName: 'contact',
  email: 'contact',
  phone: 'contact',
  country: 'address',
  city: 'address',
  address: 'address',
  taxId: 'credit',
  paymentTerms: 'credit',
  creditLimit: 'credit',
  deliveryNotes: 'notes',
  internalNotes: 'notes',
};

/// The subset of CreateCustomerInput/UpdateCustomerInput this validator
/// needs — both real input types satisfy this shape.
export interface CustomerFormFields {
  customerCode?: string;
  companyName?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  taxId?: string | null;
  creditLimit?: number | null;
  deliveryNotes?: string | null;
  internalNotes?: string | null;
}

/// Mirrors CreateCustomerDto/UpdateCustomerDto (apps/api/src/customers/dto/*.ts).
export function validateCustomerField(field: string, data: CustomerFormFields): string | null {
  switch (field) {
    case 'companyName':
      if (!data.companyName?.trim()) return 'Required';
      if (data.companyName.length > 200) return 'Max 200 characters';
      return null;
    case 'contactName':
      if (!data.contactName?.trim()) return 'Required';
      if (data.contactName.length > 200) return 'Max 200 characters';
      return null;
    case 'customerCode':
      if (data.customerCode && !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(data.customerCode)) {
        return 'Letters, numbers, and hyphens only';
      }
      if ((data.customerCode?.length ?? 0) > 50) return 'Max 50 characters';
      return null;
    case 'email':
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Invalid email';
      return null;
    case 'phone':
      if ((data.phone?.length ?? 0) > 50) return 'Max 50 characters';
      return null;
    case 'country':
    case 'city':
      if (((data[field as 'country' | 'city'] as string | null | undefined)?.length ?? 0) > 100) {
        return 'Max 100 characters';
      }
      return null;
    case 'address':
      if ((data.address?.length ?? 0) > 300) return 'Max 300 characters';
      return null;
    case 'taxId':
      if ((data.taxId?.length ?? 0) > 100) return 'Max 100 characters';
      return null;
    case 'creditLimit':
      if (data.creditLimit != null && (data.creditLimit < 0 || data.creditLimit > 999999.99)) {
        return 'Must be between 0 and 999,999.99';
      }
      return null;
    case 'deliveryNotes':
    case 'internalNotes':
      if (
        ((data[field as 'deliveryNotes' | 'internalNotes'] as string | null | undefined)?.length ?? 0) >
        2000
      ) {
        return 'Max 2000 characters';
      }
      return null;
    default:
      return null;
  }
}

export function validateCustomerFields(
  fields: readonly string[],
  data: CustomerFormFields,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateCustomerField(field, data);
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

export function SectionTitle({
  icon: Icon,
  title,
  errors,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  errors: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
      {errors > 0 && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          {errors}
        </Badge>
      )}
    </div>
  );
}

export function emptySectionCounts(): Record<CustomerSectionKey, number> {
  return { company: 0, contact: 0, address: 0, credit: 0, notes: 0 };
}
