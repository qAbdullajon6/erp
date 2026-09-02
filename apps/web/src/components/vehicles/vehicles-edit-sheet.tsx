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
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
  VEHICLE_FIELD_SECTION,
  emptySectionCounts,
  toOptionalNumber,
  validateVehicleField,
  validateVehicleFields,
  type VehicleFormFields,
} from '@/components/vehicles/vehicle-form-shared';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Cog,
  FileText,
  Gauge,
  Lightbulb,
  Settings2,
  Truck,
  Weight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Errors = Record<string, string>;
type FormState = VehicleFormFields & { status: VehicleStatus };

const ALL_FIELDS = Object.keys(VEHICLE_FIELD_SECTION);
const STATUSES: VehicleStatus[] = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'];
const FUEL_TYPES = ['Diesel', 'Petrol', 'CNG', 'LPG', 'Electric', 'Hybrid'];
const TRANSMISSION_TYPES = ['Manual', 'Automatic', 'CVT', 'Semi-Automatic'];

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
    vin: vehicle.vin ?? '',
    engineNumber: vehicle.engineNumber ?? '',
    odometer: vehicle.odometer != null ? String(vehicle.odometer) : '',
    fuelType: vehicle.fuelType ?? '',
    transmission: vehicle.transmission ?? '',
    axles: vehicle.axles != null ? String(vehicle.axles) : '',
    notes: vehicle.notes ?? '',
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
    vin: data.vin.trim() || undefined,
    engineNumber: data.engineNumber.trim() || undefined,
    fuelType: data.fuelType || undefined,
    transmission: data.transmission || undefined,
    notes: data.notes.trim() || undefined,
  };
  const year = toOptionalNumber(data.year);
  if (year !== undefined) input.year = Math.trunc(year);
  const capacityKg = toOptionalNumber(data.capacityKg);
  if (capacityKg !== undefined) input.capacityKg = capacityKg;
  const capacityM3 = toOptionalNumber(data.capacityM3);
  if (capacityM3 !== undefined) input.capacityM3 = capacityM3;
  const odometer = toOptionalNumber(data.odometer);
  if (odometer !== undefined) input.odometer = Math.trunc(odometer);
  const axles = toOptionalNumber(data.axles);
  if (axles !== undefined) input.axles = Math.trunc(axles);
  return input;
}

/* ─── small helpers ──────────────────────────────────────────── */
type ExpiryState = 'expired' | 'soon' | 'ok' | 'none';

function expiryState(dateStr: string): ExpiryState {
  if (!dateStr) return 'none';
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms < 0) return 'expired';
  if (ms < 30 * 24 * 60 * 60 * 1000) return 'soon';
  return 'ok';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function Card({
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
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {errorCount > 0 && (
          <Badge variant="destructive" className="ml-auto px-1.5 text-[10px]">
            {errorCount}
          </Badge>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function NativeSelect({
  id, value, onChange, children, placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'flex h-[38px] w-full appearance-none rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
        'transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
        !value && 'text-muted-foreground',
      )}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

function QIRow({ label, value, expiry }: { label: string; value: string; expiry?: ExpiryState }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn(
        'flex items-center gap-1 text-[11px] font-medium',
        expiry === 'expired' && 'text-destructive',
        expiry === 'soon' && 'text-amber-500',
        expiry === 'ok' && 'text-emerald-500',
        !expiry && (value && value !== '—' ? 'text-foreground' : 'text-muted-foreground/40'),
      )}>
        {expiry === 'expired' && <AlertTriangle className="h-3 w-3" />}
        {expiry === 'soon' && <CalendarClock className="h-3 w-3" />}
        {expiry === 'ok' && <BadgeCheck className="h-3 w-3" />}
        {value || '—'}
      </span>
    </div>
  );
}

function EditSidebar({ formData }: { formData: FormState }) {
  const plate = formData.plateNumber.trim();
  const vehicleLabel = [formData.make, formData.model, formData.year, formData.type]
    .filter(Boolean).join(' · ');

  const insState = expiryState(formData.insuranceExpiry);
  const inspState = expiryState(formData.inspectionExpiry);

  const statusColors: Record<VehicleStatus, string> = {
    AVAILABLE: 'bg-emerald-500/15 text-emerald-500',
    IN_USE: 'bg-blue-500/15 text-blue-500',
    MAINTENANCE: 'bg-amber-500/15 text-amber-500',
    INACTIVE: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Vehicle Preview */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
            <Truck className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Vehicle Preview</h3>
        </div>

        <div className="relative h-36 w-full overflow-hidden bg-muted/20">
          <img
            src="/isuzi.png"
            alt="Vehicle preview"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
          />
        </div>

        <div className="border-t border-border/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 shrink-0 text-brand" />
            {plate
              ? <span className="font-mono text-sm font-bold tracking-wider">{plate}</span>
              : <span className="text-sm text-muted-foreground/50">Plate number</span>
            }
            <Badge className={cn('ml-auto border-0 text-[10px] px-1.5 py-0', statusColors[formData.status])}>
              {statusLabel(formData.status)}
            </Badge>
          </div>
          {vehicleLabel
            ? <p className="mt-1.5 text-[11px] text-muted-foreground">{vehicleLabel}</p>
            : <p className="mt-1.5 text-[11px] text-muted-foreground/40">Enter make, model, year & type</p>
          }
          {(formData.capacityKg || formData.capacityM3) && (
            <div className="mt-2.5 flex items-center gap-3">
              {formData.capacityKg && (
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Weight className="h-3 w-3 text-muted-foreground" />
                  {Number(formData.capacityKg).toLocaleString()} kg
                </span>
              )}
              {formData.capacityKg && formData.capacityM3 && <span className="text-[10px] text-border">·</span>}
              {formData.capacityM3 && (
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Gauge className="h-3 w-3 text-muted-foreground" />
                  {Number(formData.capacityM3).toLocaleString()} m³
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Quick Information */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Quick Information</h3>
        </div>
        <div className="divide-y divide-border/30 px-4">
          <QIRow label="Vehicle code" value={formData.vehicleCode || '—'} />
          <QIRow label="VIN" value={formData.vin || '—'} />
          <QIRow label="Fuel type" value={formData.fuelType || '—'} />
          <QIRow label="Transmission" value={formData.transmission || '—'} />
          <QIRow label="Axles" value={formData.axles || '—'} />
          <QIRow
            label="Odometer"
            value={formData.odometer ? `${Number(formData.odometer).toLocaleString()} km` : '—'}
          />
          <QIRow
            label="Insurance expiry"
            value={formatDate(formData.insuranceExpiry)}
            expiry={insState !== 'none' ? insState : undefined}
          />
          <QIRow
            label="Inspection expiry"
            value={formatDate(formData.inspectionExpiry)}
            expiry={inspState !== 'none' ? inspState : undefined}
          />
        </div>
      </section>

      {/* Tips */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
            <Lightbulb className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Tips</h3>
        </div>
        <ul className="space-y-2 p-4">
          {[
            'Plate number must match official registration.',
            'Keep insurance and inspection dates up to date.',
            'VIN helps with parts and service lookup.',
            'Status changes affect dispatch availability.',
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────── */
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

  const errorCount = Object.keys(errors).length;

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
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          'w-[calc(100vw-2rem)] max-w-5xl',
          'max-h-[calc(100svh-2rem)]',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Settings2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Edit Vehicle</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {vehicle.plateNumber} · {vehicle.vehicleCode}
              </p>
            </div>
          </div>
          <button
            onClick={() => !loading && onOpenChange(false)}
            className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex min-h-0 flex-1">
          {/* Left: form */}
          <div ref={bodyRef} className="flex-[62] space-y-3.5 overflow-y-auto px-5 py-4 scrollbar-thin">

            {/* Identity */}
            <Card icon={Truck} title="Identity" errorCount={errorsBySection.identity}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="plateNumber" label="Plate number" required error={errors.plateNumber}>
                  <Input
                    id="plateNumber"
                    value={formData.plateNumber}
                    onChange={(e) => setField('plateNumber', e.target.value)}
                    className="h-[38px]"
                  />
                </Field>
                <Field id="vehicleCode" label="Vehicle code" required error={errors.vehicleCode}>
                  <Input
                    id="vehicleCode"
                    value={formData.vehicleCode}
                    onChange={(e) => setField('vehicleCode', e.target.value)}
                    className="h-[38px]"
                  />
                </Field>
                <Field id="type" label="Type" required error={errors.type} className="sm:col-span-2">
                  <Input
                    id="type"
                    value={formData.type}
                    onChange={(e) => setField('type', e.target.value)}
                    className="h-[38px]"
                  />
                </Field>
                <Field id="make" label="Make" error={errors.make}>
                  <Input id="make" value={formData.make} onChange={(e) => setField('make', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="model" label="Model" error={errors.model}>
                  <Input id="model" value={formData.model} onChange={(e) => setField('model', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="year" label="Year" error={errors.year}>
                  <Input id="year" type="number" value={formData.year} onChange={(e) => setField('year', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="vin" label="VIN" error={errors.vin}>
                  <Input id="vin" value={formData.vin} onChange={(e) => setField('vin', e.target.value)} className="h-[38px] font-mono text-xs" />
                </Field>
              </div>
            </Card>

            {/* Capacity */}
            <Card icon={Gauge} title="Capacity" errorCount={errorsBySection.capacity}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="capacityKg" label="Capacity (kg)" error={errors.capacityKg} hint="Maximum load weight">
                  <Input id="capacityKg" type="number" value={formData.capacityKg} onChange={(e) => setField('capacityKg', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="capacityM3" label="Capacity (m³)" error={errors.capacityM3} hint="Cargo volume capacity">
                  <Input id="capacityM3" type="number" value={formData.capacityM3} onChange={(e) => setField('capacityM3', e.target.value)} className="h-[38px]" />
                </Field>
              </div>
            </Card>

            {/* Documents & Compliance */}
            <Card icon={FileText} title="Documents & Compliance" errorCount={errorsBySection.documents}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="insuranceExpiry" label="Insurance / registration expiry" error={errors.insuranceExpiry}>
                  <Input id="insuranceExpiry" type="date" value={formData.insuranceExpiry} onChange={(e) => setField('insuranceExpiry', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="inspectionExpiry" label="Inspection expiry" error={errors.inspectionExpiry}>
                  <Input id="inspectionExpiry" type="date" value={formData.inspectionExpiry} onChange={(e) => setField('inspectionExpiry', e.target.value)} className="h-[38px]" />
                </Field>
              </div>
            </Card>

            {/* Additional Information */}
            <Card icon={Cog} title="Additional Information" errorCount={errorsBySection.additional}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="fuelType" label="Fuel type" error={errors.fuelType}>
                  <NativeSelect id="fuelType" value={formData.fuelType} onChange={(v) => setField('fuelType', v)} placeholder="Select…">
                    {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </NativeSelect>
                </Field>
                <Field id="transmission" label="Transmission" error={errors.transmission}>
                  <NativeSelect id="transmission" value={formData.transmission} onChange={(v) => setField('transmission', v)} placeholder="Select…">
                    {TRANSMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </NativeSelect>
                </Field>
                <Field id="axles" label="Axles" error={errors.axles}>
                  <Input id="axles" type="number" min={1} max={20} value={formData.axles} onChange={(e) => setField('axles', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="odometer" label="Odometer (km)" error={errors.odometer}>
                  <Input id="odometer" type="number" min={0} value={formData.odometer} onChange={(e) => setField('odometer', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="engineNumber" label="Engine number" error={errors.engineNumber} className="sm:col-span-2">
                  <Input id="engineNumber" value={formData.engineNumber} onChange={(e) => setField('engineNumber', e.target.value)} className="h-[38px]" />
                </Field>
                <Field id="notes" label="Notes" error={errors.notes} className="sm:col-span-3">
                  <textarea
                    id="notes"
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    className={cn(
                      'flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
                      'placeholder:text-muted-foreground transition-colors',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    )}
                  />
                </Field>
              </div>
            </Card>

            {/* Status */}
            <Card icon={Settings2} title="Status" errorCount={errorsBySection.status}>
              <div data-field="status">
                <Label className="text-xs font-medium text-muted-foreground">Fleet status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setField('status', v as VehicleStatus)}
                >
                  <SelectTrigger className="mt-1 h-[38px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>
          </div>

          {/* Right: preview */}
          <div className="hidden flex-[38] flex-col overflow-y-auto border-l border-border/50 bg-muted/10 px-4 py-4 scrollbar-thin lg:flex">
            <EditSidebar formData={formData} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-card px-6 py-3.5">
          <span className={cn(
            'flex items-center gap-1.5 text-xs font-medium',
            errorCount > 0 ? 'text-destructive' : 'text-emerald-500',
          )}>
            {errorCount > 0
              ? <><AlertTriangle className="h-3.5 w-3.5" />{errorCount} field{errorCount !== 1 ? 's' : ''} need attention</>
              : <><BadgeCheck className="h-3.5 w-3.5" />All changes valid</>
            }
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={loading} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              disabled={loading}
              onClick={() => void handleSave()}
            >
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
