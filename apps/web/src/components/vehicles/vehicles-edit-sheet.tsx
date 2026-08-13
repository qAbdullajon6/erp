'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  useUpdateVehicle,
  type UpdateVehicleInput,
  type Vehicle,
  type VehicleStatus,
} from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { statusLabel } from '@/components/shared/status-badge';
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
type FormState = VehicleFormFields & { status: VehicleStatus };

const ALL_FIELDS = Object.keys(VEHICLE_FIELD_SECTION);
const STATUSES: VehicleStatus[] = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'];

function toForm(vehicle: Vehicle): FormState {
  return {
    vehicleCode: vehicle.vehicleCode,
    plateNumber: vehicle.plateNumber,
    type: vehicle.type,
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year != null ? String(vehicle.year) : '',
    capacityKg: vehicle.capacityKg ?? '',
    capacityM3: vehicle.capacityM3 ?? '',
    insuranceExpiry: vehicle.insuranceExpiry?.slice(0, 10) ?? '',
    inspectionExpiry: vehicle.inspectionExpiry?.slice(0, 10) ?? '',
    status: vehicle.status,
  };
}

function toUpdateInput(data: FormState): UpdateVehicleInput {
  const input: UpdateVehicleInput = {
    vehicleCode: data.vehicleCode.trim(),
    plateNumber: data.plateNumber.trim(),
    type: data.type.trim(),
    status: data.status,
    make: data.make.trim() || undefined,
    model: data.model.trim() || undefined,
    insuranceExpiry: data.insuranceExpiry || undefined,
    inspectionExpiry: data.inspectionExpiry || undefined,
  };
  const year = toOptionalNumber(data.year);
  if (year !== undefined) input.year = Math.trunc(year);
  const capacityKg = toOptionalNumber(data.capacityKg);
  if (capacityKg !== undefined) input.capacityKg = capacityKg;
  const capacityM3 = toOptionalNumber(data.capacityM3);
  if (capacityM3 !== undefined) input.capacityM3 = capacityM3;
  return input;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
}

export function VehiclesEditSheet({ open, onOpenChange, vehicle }: Props) {
  const { mutate: update, loading } = useUpdateVehicle(vehicle.id);
  const [formData, setFormData] = useState<FormState>(() => toForm(vehicle));
  const [errors, setErrors] = useState<Errors>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFormData(toForm(vehicle));
      setErrors({});
    }
  }, [open, vehicle]);

  const setField = (field: keyof FormState, value: string) => {
    const next = { ...formData, [field]: value } as FormState;
    setFormData(next);
    setErrors((prev) => {
      const out = { ...prev };
      const err = validateVehicleField(field, next, { requireVehicleCode: true });
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
    const all = validateVehicleFields(ALL_FIELDS, formData, { requireVehicleCode: true });
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
      await update(toUpdateInput(formData));
      toast.success('Vehicle updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update vehicle'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Edit vehicle</SheetTitle>
          <SheetDescription className="text-xs">
            {vehicle.plateNumber} · {vehicle.vehicleCode}
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 scrollbar-thin">
          <Section icon={Truck} title="Identity" errorCount={errorsBySection.identity}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="plateNumber" label="Plate number" required error={errors.plateNumber}>
                <Input
                  id="plateNumber"
                  value={formData.plateNumber}
                  onChange={(e) => setField('plateNumber', e.target.value)}
                />
              </Field>
              <Field id="vehicleCode" label="Vehicle code" required error={errors.vehicleCode}>
                <Input
                  id="vehicleCode"
                  value={formData.vehicleCode}
                  onChange={(e) => setField('vehicleCode', e.target.value)}
                />
              </Field>
              <Field id="type" label="Type" required error={errors.type} className="sm:col-span-2">
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => setField('type', e.target.value)}
                />
              </Field>
              <Field id="make" label="Make" error={errors.make}>
                <Input id="make" value={formData.make} onChange={(e) => setField('make', e.target.value)} />
              </Field>
              <Field id="model" label="Model" error={errors.model}>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setField('model', e.target.value)}
                />
              </Field>
              <Field id="year" label="Year" error={errors.year}>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setField('year', e.target.value)}
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
                />
              </Field>
              <Field id="capacityM3" label="Capacity (m³)" error={errors.capacityM3}>
                <Input
                  id="capacityM3"
                  type="number"
                  value={formData.capacityM3}
                  onChange={(e) => setField('capacityM3', e.target.value)}
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
                />
              </Field>
              <Field id="inspectionExpiry" label="Inspection expiry" error={errors.inspectionExpiry}>
                <Input
                  id="inspectionExpiry"
                  type="date"
                  value={formData.inspectionExpiry}
                  onChange={(e) => setField('inspectionExpiry', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section icon={Truck} title="Status" errorCount={errorsBySection.status}>
            <div data-field="status">
              <Label className="text-xs font-medium text-muted-foreground">Fleet status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setField('status', v as VehicleStatus)}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          >
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
