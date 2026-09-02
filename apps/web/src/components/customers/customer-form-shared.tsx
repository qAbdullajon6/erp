'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { isValidCurrencyCode } from '@/lib/currencies';

/// Shared between CustomersCreateSheet and CustomersEditSheet.

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
  postalCode: 'address',
  taxId: 'credit',
  paymentTerms: 'credit',
  paymentTermsDays: 'credit',
  creditLimit: 'credit',
  currency: 'credit',
  deliveryNotes: 'notes',
  internalNotes: 'notes',
};

export interface CustomerFormFields {
  customerCode?: string;
  companyName?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  /** Required when paymentTerms = CUSTOM; NaN = CUSTOM selected but no days entered yet */
  paymentTermsDays?: number | null;
  /** null = no credit limit; 0 = $0 credit; positive = credit cap */
  creditLimit?: number | null;
  currency?: string | null;
  deliveryNotes?: string | null;
  internalNotes?: string | null;
}

export function validateCustomerField(field: string, data: CustomerFormFields): string | null {
  switch (field) {
    case 'companyName':
      if (!data.companyName?.trim()) return 'Required';
      if (data.companyName.length > 200) return 'Max 200 characters';
      return null;
    case 'contactName':
      // Optional — but if provided must be non-empty meaningful text
      if (data.contactName && !data.contactName.trim()) return 'Enter a name or leave blank';
      if ((data.contactName?.length ?? 0) > 200) return 'Max 200 characters';
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
      if (data.country && !/^[A-Z]{2}$/.test(data.country)) {
        return 'Select a valid country';
      }
      return null;
    case 'city':
      if (((data['city'] as string | null | undefined)?.length ?? 0) > 100) {
        return 'Max 100 characters';
      }
      return null;
    case 'address':
      if ((data.address?.length ?? 0) > 300) return 'Max 300 characters';
      return null;
    case 'postalCode':
      if ((data.postalCode?.length ?? 0) > 20) return 'Max 20 characters';
      return null;
    case 'taxId':
      if ((data.taxId?.length ?? 0) > 100) return 'Max 100 characters';
      return null;
    case 'paymentTermsDays': {
      // Only required and validated when paymentTerms = CUSTOM.
      if (data.paymentTerms !== 'CUSTOM') return null;
      if (data.paymentTermsDays == null || Number.isNaN(data.paymentTermsDays as number)) return 'Enter a number of days';
      const d = data.paymentTermsDays as number;
      if (d < 0) return 'Must be 0 or more';
      if (!Number.isInteger(d)) return 'Must be a whole number';
      return null;
    }
    case 'creditLimit': {
      // null = "Unlimited" — always valid.
      // 0    = "No credit" — always valid (explicit zero is intentional).
      if (data.creditLimit == null) return null;
      const limit = data.creditLimit as number;
      if (limit === 0) return null; // No credit — valid
      // NaN = "Limited" mode selected but no amount entered yet.
      if (Number.isNaN(limit)) return 'Enter an amount';
      if (limit < 0) return 'Amount cannot be negative';
      if (limit > 99_999_999.99) return 'Amount too large';
      return null;
    }
    case 'currency':
      if (data.currency && !isValidCurrencyCode(data.currency)) {
        return 'Select a valid currency';
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
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  errors: number;
  action?: React.ReactNode;
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
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export function emptySectionCounts(): Record<CustomerSectionKey, number> {
  return { company: 0, contact: 0, address: 0, credit: 0, notes: 0 };
}
