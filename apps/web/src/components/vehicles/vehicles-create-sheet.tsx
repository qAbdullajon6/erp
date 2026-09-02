'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useCreateVehicle, type CreateVehicleInput, type Vehicle } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import {
  Field,
  Section,
  VEHICLE_FIELD_SECTION,
  emptySectionCounts,
  toOptionalNumber,
  validateVehicleField,
  validateVehicleFields,
  type VehicleFormFields,
} from '@/components/vehicles/vehicle-form-shared';
import { FileText, Gauge, Truck } from 'lucide-react';
import { toast } from 'sonner';

type Errors = Record<string, string>;
type FormState = VehicleFormFields;

const ALL_FIELDS = Object.keys(VEHICLE_FIELD_SECTION).filter((f) => f !== 'status');

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
      const err = validateVehicleField(field, next);
      if (err) out[field] = err;
      else delete out[field];
      return out;
    });
  };

  const errorsBySection = useMemo(() => {
    const counts = emptySectionCounts();
    for (const field of Object.keys(errors)) {
      const section = VEHICLE_FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const handleSave = async () => {
    const all = validateVehicleFields(ALL_FIELDS, formData);
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
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <FileText className="mt-0.5 h-3 w-3 shrink-0" />
              Ownership, fuel type, odometer, notes, and document uploads are not on the vehicles API yet.
            </p>
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
