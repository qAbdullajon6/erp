'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useCreateVehicle, type CreateVehicleInput, type Vehicle } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { cn } from '@/lib/utils';
import { FileText, Gauge, Truck } from 'lucide-react';
import { toast } from 'sonner';

type SectionKey = 'identity' | 'capacity' | 'documents';

const FIELD_SECTION: Record<string, SectionKey> = {
  vehicleCode: 'identity',
  plateNumber: 'identity',
  type: 'identity',
  make: 'identity',
  model: 'identity',
  year: 'identity',
  capacityKg: 'capacity',
  capacityM3: 'capacity',
  insuranceExpiry: 'documents',
  inspectionExpiry: 'documents',
};

type Errors = Record<string, string>;
type FormState = {
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
};

const EMPTY: FormState = {
  vehicleCode: '',
  plateNumber: '',
  type: '',
  make: '',
  model: '',
  year: '',
  capacityKg: '',
  capacityM3: '',
  insuranceExpiry: '',
  inspectionExpiry: '',
};

const ALL_FIELDS = Object.keys(FIELD_SECTION);
const CURRENT_YEAR = new Date().getUTCFullYear();

function toOptionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function validateField(field: string, data: FormState): string | null {
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
      if (data[field as 'insuranceExpiry' | 'inspectionExpiry'] &&
        !/^\d{4}-\d{2}-\d{2}$/.test(data[field as 'insuranceExpiry' | 'inspectionExpiry'])) {
        return 'Use YYYY-MM-DD';
      }
      return null;
    default:
      return null;
  }
}

function toCreateInput(data: FormState): CreateVehicleInput {
  const input: CreateVehicleInput = {
    plateNumber: data.plateNumber.trim(),
    type: data.type.trim(),
  };
  if (data.vehicleCode.trim()) input.vehicleCode = data.vehicleCode.trim();
  if (data.make.trim()) input.make = data.make.trim();
  if (data.model.trim()) input.model = data.model.trim();
  const year = toOptionalNumber(data.year);
  if (year !== undefined) input.year = Math.trunc(year);
  const capacityKg = toOptionalNumber(data.capacityKg);
  if (capacityKg !== undefined) input.capacityKg = capacityKg;
  const capacityM3 = toOptionalNumber(data.capacityM3);
  if (capacityM3 !== undefined) input.capacityM3 = capacityM3;
  if (data.insuranceExpiry) input.insuranceExpiry = data.insuranceExpiry;
  if (data.inspectionExpiry) input.inspectionExpiry = data.inspectionExpiry;
  return input;
}

function Field({
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (vehicle: Vehicle) => void;
}

export function VehiclesCreateSheet({ open, onOpenChange, onCreated }: Props) {
  const { mutate: create, loading } = useCreateVehicle();
  const [formData, setFormData] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY);
      setErrors({});
    }
  }, [open]);

  const setField = (field: keyof FormState, value: string) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setErrors((prev) => {
      const out = { ...prev };
      const err = validateField(field, next);
      if (err) out[field] = err;
      else delete out[field];
      return out;
    });
  };

  const errorsBySection = useMemo(() => {
    const counts: Record<SectionKey, number> = { identity: 0, capacity: 0, documents: 0 };
    for (const field of Object.keys(errors)) {
      const section = FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const handleSave = async () => {
    const all: Errors = {};
    for (const f of ALL_FIELDS) {
      const err = validateField(f, formData);
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
    try {
      const created = await create(toCreateInput(formData));
      toast.success(`Vehicle ${created.plateNumber} created`);
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create vehicle'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New vehicle</SheetTitle>
          <SheetDescription className="text-xs">
            Add a unit to the fleet roster. Code auto-generates if left blank.
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 scrollbar-thin">
          <Section
            icon={Truck}
            title="Identity"
            errorCount={errorsBySection.identity}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="plateNumber" label="Plate number" required error={errors.plateNumber}>
                <Input
                  id="plateNumber"
                  value={formData.plateNumber}
                  onChange={(e) => setField('plateNumber', e.target.value)}
                  data-testid="vehicles-plate-number"
                />
              </Field>
              <Field
                id="vehicleCode"
                label="Vehicle code"
                error={errors.vehicleCode}
                hint="Leave empty to auto-generate"
              >
                <Input
                  id="vehicleCode"
                  value={formData.vehicleCode}
                  onChange={(e) => setField('vehicleCode', e.target.value)}
                  data-testid="vehicles-code"
                />
              </Field>
              <Field
                id="type"
                label="Type"
                required
                error={errors.type}
                hint="e.g. box truck, refrigerated"
                className="sm:col-span-2"
              >
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => setField('type', e.target.value)}
                  data-testid="vehicles-type"
                />
              </Field>
              <Field id="make" label="Make" error={errors.make}>
                <Input
                  id="make"
                  value={formData.make}
                  onChange={(e) => setField('make', e.target.value)}
                  data-testid="vehicles-make"
                />
              </Field>
              <Field id="model" label="Model" error={errors.model}>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setField('model', e.target.value)}
                  data-testid="vehicles-model"
                />
              </Field>
              <Field id="year" label="Year" error={errors.year}>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setField('year', e.target.value)}
                  data-testid="vehicles-year"
                />
              </Field>
            </div>
          </Section>

          <Section icon={Gauge} title="Capacity" errorCount={errorsBySection.capacity}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="capacityKg" label="Capacity (kg)" error={errors.capacityKg}>
                <Input
                  id="capacityKg"
                  type="number"
                  value={formData.capacityKg}
                  onChange={(e) => setField('capacityKg', e.target.value)}
                  data-testid="vehicles-capacity-kg"
                />
              </Field>
              <Field id="capacityM3" label="Capacity (m³)" error={errors.capacityM3}>
                <Input
                  id="capacityM3"
                  type="number"
                  value={formData.capacityM3}
                  onChange={(e) => setField('capacityM3', e.target.value)}
                  data-testid="vehicles-capacity-m3"
                />
              </Field>
            </div>
          </Section>

          <Section icon={FileText} title="Documents" errorCount={errorsBySection.documents}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="insuranceExpiry" label="Insurance / registration expiry" error={errors.insuranceExpiry}>
                <Input
                  id="insuranceExpiry"
                  type="date"
                  value={formData.insuranceExpiry}
                  onChange={(e) => setField('insuranceExpiry', e.target.value)}
                  data-testid="vehicles-insurance-expiry"
                />
              </Field>
              <Field id="inspectionExpiry" label="Inspection expiry" error={errors.inspectionExpiry}>
                <Input
                  id="inspectionExpiry"
                  type="date"
                  value={formData.inspectionExpiry}
                  onChange={(e) => setField('inspectionExpiry', e.target.value)}
                  data-testid="vehicles-inspection-expiry"
                />
              </Field>
            </div>
          </Section>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
            disabled={loading}
            onClick={() => void handleSave()}
            data-testid="vehicles-submit-button"
          >
            {loading ? 'Creating…' : 'Create Vehicle'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  icon: Icon,
  title,
  errorCount,
  children,
}: {
  icon: typeof Truck;
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
