'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/// Shared between DriversCreateSheet and DriversEditSheet — both sheets
/// validate and render the same driver fields (create additionally has
/// `employeeCode` free-typed with an "auto-generated if empty" placeholder;
/// edit adds `status`). Previously each file hand-copied its own Field,
/// validateField, and SectionTitle, which let the two validation rule sets
/// drift apart (edit was missing the employeeCode/licenseNumber max-length
/// checks create had) — the same duplication order-form-shared.tsx and
/// customer-form-shared.tsx were extracted to fix.

export type DriverSectionKey = 'identity' | 'contact' | 'license' | 'status';

export const DRIVER_FIELD_SECTION: Record<string, DriverSectionKey> = {
  employeeCode: 'identity',
  firstName: 'identity',
  lastName: 'identity',
  phone: 'contact',
  email: 'contact',
  licenseNumber: 'license',
  licenseExpiry: 'license',
  status: 'status',
};

/// The subset of CreateDriverInput/UpdateDriverInput this validator needs —
/// both real input types satisfy this shape.
export interface DriverFormFields {
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
}

/// Mirrors CreateDriverDto/UpdateDriverDto (apps/api/src/drivers/dto/*.ts).
export function validateDriverField(field: string, data: DriverFormFields): string | null {
  switch (field) {
    case 'firstName':
      if (!data.firstName?.trim()) return 'Required';
      if (data.firstName.length > 100) return 'Max 100 characters';
      return null;
    case 'lastName':
      if (!data.lastName?.trim()) return 'Required';
      if (data.lastName.length > 100) return 'Max 100 characters';
      return null;
    case 'phone':
      if (!data.phone?.trim()) return 'Required';
      if (data.phone.length > 50) return 'Max 50 characters';
      return null;
    case 'email':
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Invalid email';
      return null;
    case 'employeeCode':
      if (data.employeeCode && !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(data.employeeCode)) {
        return 'Letters, numbers, and hyphens only';
      }
      if ((data.employeeCode?.length ?? 0) > 50) return 'Max 50 characters';
      return null;
    case 'licenseNumber':
      if ((data.licenseNumber?.length ?? 0) > 100) return 'Max 100 characters';
      return null;
    case 'licenseExpiry':
      if (data.licenseExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(data.licenseExpiry)) {
        return 'Use YYYY-MM-DD';
      }
      return null;
    default:
      return null;
  }
}

export function validateDriverFields(
  fields: readonly string[],
  data: DriverFormFields,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateDriverField(field, data);
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

export function emptySectionCounts(): Record<DriverSectionKey, number> {
  return { identity: 0, contact: 0, license: 0, status: 0 };
}
