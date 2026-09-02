'use client';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type VehicleSectionKey = 'identity' | 'capacity' | 'documents' | 'additional' | 'status';

export const VEHICLE_FIELD_SECTION: Record<string, VehicleSectionKey> = {
  vehicleCode: 'identity',
  plateNumber: 'identity',
  type: 'identity',
  make: 'identity',
  model: 'identity',
  year: 'identity',
  vin: 'identity',
  capacityKg: 'capacity',
  capacityM3: 'capacity',
  insuranceExpiry: 'documents',
  inspectionExpiry: 'documents',
  odometer: 'additional',
  fuelType: 'additional',
  transmission: 'additional',
  axles: 'additional',
  engineNumber: 'additional',
  notes: 'additional',
  status: 'status',
};

const CURRENT_YEAR = new Date().getUTCFullYear();

export interface VehicleFormFields {
  vehicleCode: string;
  plateNumber: string;
  type: string;
  make: string;
  model: string;
  year: string;
  capacityKg: string;
  capacityM3: string;
  insuranceExpiry: string;
  inspectionExpiry: string;
  vin: string;
  engineNumber: string;
  odometer: string;
  fuelType: string;
  transmission: string;
  axles: string;
  notes: string;
}

export function toOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function validateVehicleField(
  field: string,
  data: VehicleFormFields,
  opts: { requireVehicleCode?: boolean } = {},
): string | null {
  switch (field) {
    case 'plateNumber':
      if (!data.plateNumber.trim()) return 'Required';
      if (data.plateNumber.length > 50) return 'Max 50 characters';
      return null;
    case 'type':
      if (!data.type.trim()) return 'Required';
      if (data.type.length > 100) return 'Max 100 characters';
      return null;
    case 'vehicleCode':
      if (opts.requireVehicleCode && !data.vehicleCode.trim()) return 'Required';
      if (data.vehicleCode && !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(data.vehicleCode)) {
        return 'Letters, numbers, and hyphens only';
      }
      if (data.vehicleCode.length > 50) return 'Max 50 characters';
      return null;
    case 'make':
    case 'model':
      if (data[field as 'make' | 'model'].length > 100) return 'Max 100 characters';
      return null;
    case 'year': {
      if (!data.year.trim()) return null;
      const y = Number(data.year);
      if (!Number.isInteger(y) || y < 1980 || y > CURRENT_YEAR + 1) {
        return `Between 1980 and ${CURRENT_YEAR + 1}`;
      }
      return null;
    }
    case 'capacityKg':
    case 'capacityM3': {
      if (!data[field as 'capacityKg' | 'capacityM3'].trim()) return null;
      const n = Number(data[field as 'capacityKg' | 'capacityM3']);
      if (!Number.isFinite(n) || n < 0) return 'Must be ≥ 0';
      return null;
    }
    case 'insuranceExpiry':
    case 'inspectionExpiry':
      if (
        data[field as 'insuranceExpiry' | 'inspectionExpiry'] &&
        !/^\d{4}-\d{2}-\d{2}$/.test(data[field as 'insuranceExpiry' | 'inspectionExpiry'])
      ) {
        return 'Use YYYY-MM-DD';
      }
      return null;
    case 'vin':
      if (data.vin.length > 50) return 'Max 50 characters';
      return null;
    case 'engineNumber':
      if (data.engineNumber.length > 100) return 'Max 100 characters';
      return null;
    case 'odometer': {
      if (!data.odometer.trim()) return null;
      const n = Number(data.odometer);
      if (!Number.isInteger(n) || n < 0) return 'Must be ≥ 0';
      return null;
    }
    case 'axles': {
      if (!data.axles.trim()) return null;
      const n = Number(data.axles);
      if (!Number.isInteger(n) || n < 1 || n > 20) return 'Between 1 and 20';
      return null;
    }
    case 'notes':
      if (data.notes.length > 1000) return 'Max 1000 characters';
      return null;
    default:
      return null;
  }
}

export function validateVehicleFields(
  fields: readonly string[],
  data: VehicleFormFields,
  opts: { requireVehicleCode?: boolean } = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateVehicleField(field, data, opts);
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
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn('space-y-1', className)} data-field={id}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function SectionCard({
  icon: Icon,
  title,
  errorCount,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  errorCount: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-surface">
      <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {errorCount > 0 && (
          <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-[10px]">
            {errorCount}
          </Badge>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** @deprecated Use SectionCard instead — kept for VehiclesEditSheet compatibility */
export function Section({
  icon: Icon,
  title,
  errorCount,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  errorCount: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {errorCount > 0 && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
            {errorCount}
          </Badge>
        )}
      </div>
      {children}
    </section>
  );
}

export function emptySectionCounts(): Record<VehicleSectionKey, number> {
  return { identity: 0, capacity: 0, documents: 0, additional: 0, status: 0 };
}
