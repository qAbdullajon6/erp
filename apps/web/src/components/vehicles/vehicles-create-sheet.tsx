'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useCreateVehicle, type CreateVehicleInput, type Vehicle } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
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
  Truck,
  Weight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ─── types ─────────────────────────────────────────────────── */
type Errors = Record<string, string>;
type FormState = VehicleFormFields;

const ALL_FIELDS = Object.keys(VEHICLE_FIELD_SECTION).filter((f) => f !== 'status');

const VEHICLE_TYPES = [
  'Box Truck', 'Flatbed', 'Refrigerated', 'Tanker', 'Curtain-sider',
  'Low-loader', 'Tipper', 'Livestock', 'Car Carrier', 'Pickup', 'Van',
];
const FUEL_TYPES = ['Diesel', 'Petrol', 'CNG', 'LPG', 'Electric', 'Hybrid'];
const TRANSMISSION_TYPES = ['Manual', 'Automatic', 'CVT', 'Semi-Automatic'];

const EMPTY: FormState = {
  vehicleCode: '', plateNumber: '', type: '', make: '', model: '', year: '',
  capacityKg: '', capacityM3: '', insuranceExpiry: '', inspectionExpiry: '',
  vin: '', engineNumber: '', odometer: '', fuelType: '', transmission: '', axles: '', notes: '',
};

/* ─── form → API ─────────────────────────────────────────────── */
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
  if (data.vin.trim()) input.vin = data.vin.trim();
  if (data.engineNumber.trim()) input.engineNumber = data.engineNumber.trim();
  const odometer = toOptionalNumber(data.odometer);
  if (odometer !== undefined) input.odometer = Math.trunc(odometer);
  if (data.fuelType) input.fuelType = data.fuelType;
  if (data.transmission) input.transmission = data.transmission;
  const axles = toOptionalNumber(data.axles);
  if (axles !== undefined) input.axles = Math.trunc(axles);
  if (data.notes.trim()) input.notes = data.notes.trim();
  return input;
}

/* ─── expiry helper ──────────────────────────────────────────── */
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

/* ─── section card ───────────────────────────────────────────── */
function Card({
  icon: Icon,
  title,
  errorCount,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  errorCount: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border/60 bg-card', className)}>
      <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {errorCount > 0 && (
          <Badge variant="destructive" className="ml-auto h-4.5 px-1.5 text-[10px]">
            {errorCount}
          </Badge>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ─── native select wrapper ──────────────────────────────────── */
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

/* ─── preview sidebar ────────────────────────────────────────── */
function QIRow({
  label, value, expiry,
}: {
  label: string;
  value: string;
  expiry?: ExpiryState;
}) {
  if (!value || value === '—') {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground/40">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn(
        'flex items-center gap-1 text-[11px] font-medium',
        expiry === 'expired' && 'text-destructive',
        expiry === 'soon' && 'text-amber-500',
        expiry === 'ok' && 'text-emerald-500',
        !expiry && 'text-foreground',
      )}>
        {expiry === 'expired' && <AlertTriangle className="h-3 w-3" />}
        {expiry === 'soon' && <CalendarClock className="h-3 w-3" />}
        {expiry === 'ok' && <BadgeCheck className="h-3 w-3" />}
        {value}
      </span>
    </div>
  );
}

function VehicleSidebar({ formData }: { formData: FormState }) {
  const plate = formData.plateNumber.trim();
  const vehicleLabel = [formData.make, formData.model, formData.year, formData.type]
    .filter(Boolean)
    .join(' · ');

  const insState = expiryState(formData.insuranceExpiry);
  const inspState = expiryState(formData.inspectionExpiry);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Vehicle Preview ── */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <h3 className="text-sm font-semibold">Vehicle Preview</h3>
        </div>

        {/* Isuzu image */}
        <div className="relative h-52 w-full overflow-hidden">
          <img
            src="/isuzi.png"
            alt="Vehicle preview"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
          />
        </div>

        {/* Plate + status */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 shrink-0 text-brand" />
            {plate
              ? <span className="font-mono text-sm font-bold tracking-wider">{plate}</span>
              : <span className="text-sm text-muted-foreground/50">Plate number</span>
            }
            <Badge className="ml-auto bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-0 text-[10px] px-1.5 py-0">
              Active
            </Badge>
          </div>

          {/* Make · Model · Year · Type */}
          {vehicleLabel
            ? <p className="mt-1.5 text-[11px] text-muted-foreground">{vehicleLabel}</p>
            : <p className="mt-1.5 text-[11px] text-muted-foreground/40">Enter make, model, year & type</p>
          }

          {/* Capacity row — only show if entered */}
          {(formData.capacityKg || formData.capacityM3) && (
            <div className="mt-2.5 flex items-center gap-3">
              {formData.capacityKg && (
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Weight className="h-3 w-3 text-muted-foreground" />
                  {Number(formData.capacityKg).toLocaleString()} kg
                </span>
              )}
              {formData.capacityKg && formData.capacityM3 && (
                <span className="text-[10px] text-border">·</span>
              )}
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

      {/* ── Quick Information ── */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Quick Information</h3>
        </div>
        <div className="divide-y divide-border/30 px-4">
          <QIRow label="Vehicle code" value={formData.vehicleCode || 'Auto-generate'} />
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

      {/* ── Tips ── */}
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
            'Regular maintenance ensures fleet reliability.',
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
  onCreated?: (vehicle: Vehicle) => void;
}

export function VehiclesCreateSheet({ open, onOpenChange, onCreated }: Props) {
  const { mutate: create, loading } = useCreateVehicle();
  const [formData, setFormData] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setFormData(EMPTY); setErrors({}); }
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

  const errorCount = Object.keys(errors).length;

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
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          'w-[calc(100vw-2rem)] max-w-5xl',
          'max-h-[calc(100svh-2rem)]',
        )}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-start justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Truck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold leading-tight">New Vehicle</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Add a unit to the fleet roster. Vehicle code auto-generates if left blank.
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

        {/* ── Two-column body ── */}
        <div className="flex min-h-0 flex-1">
          {/* Left: form */}
          <div
            ref={bodyRef}
            className="flex-[62] space-y-3.5 overflow-y-auto px-5 py-4 scrollbar-thin"
          >
            {/* Identity */}
            <Card icon={Truck} title="Identity" errorCount={errorsBySection.identity}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="plateNumber" label="Plate number" required error={errors.plateNumber}>
                  <Input
                    id="plateNumber"
                    placeholder="01 A 123 BC"
                    value={formData.plateNumber}
                    onChange={(e) => setField('plateNumber', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-plate-number"
                  />
                </Field>
                <Field
                  id="vehicleCode"
                  label="Vehicle code"
                  error={errors.vehicleCode}
                  hint="Auto-generated if left blank"
                >
                  <Input
                    id="vehicleCode"
                    placeholder="VEH-001"
                    value={formData.vehicleCode}
                    onChange={(e) => setField('vehicleCode', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-code"
                  />
                </Field>

                <Field
                  id="type"
                  label="Type"
                  required
                  error={errors.type}
                  className="sm:col-span-2"
                >
                  <Input
                    id="type"
                    list="vehicle-types-list"
                    placeholder="Box Truck, Flatbed, Refrigerated…"
                    value={formData.type}
                    onChange={(e) => setField('type', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-type"
                  />
                  <datalist id="vehicle-types-list">
                    {VEHICLE_TYPES.map((t) => <option key={t} value={t} />)}
                  </datalist>
                </Field>

                <Field id="make" label="Make" error={errors.make}>
                  <Input
                    id="make"
                    placeholder="Isuzu"
                    value={formData.make}
                    onChange={(e) => setField('make', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-make"
                  />
                </Field>
                <Field id="model" label="Model" error={errors.model}>
                  <Input
                    id="model"
                    placeholder="NPR 82"
                    value={formData.model}
                    onChange={(e) => setField('model', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-model"
                  />
                </Field>

                <Field id="year" label="Year" error={errors.year}>
                  <Input
                    id="year"
                    type="number"
                    placeholder="2023"
                    value={formData.year}
                    onChange={(e) => setField('year', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-year"
                  />
                </Field>
                <Field id="vin" label="VIN" error={errors.vin}>
                  <Input
                    id="vin"
                    placeholder="JALB4W166P7900123"
                    value={formData.vin}
                    onChange={(e) => setField('vin', e.target.value)}
                    className="h-[38px] font-mono text-xs"
                  />
                </Field>
              </div>
            </Card>

            {/* Capacity */}
            <Card icon={Gauge} title="Capacity" errorCount={errorsBySection.capacity}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="capacityKg" label="Capacity (kg)" error={errors.capacityKg} hint="Maximum load weight">
                  <Input
                    id="capacityKg"
                    type="number"
                    placeholder="5000"
                    value={formData.capacityKg}
                    onChange={(e) => setField('capacityKg', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-capacity-kg"
                  />
                </Field>
                <Field id="capacityM3" label="Capacity (m³)" error={errors.capacityM3} hint="Cargo volume capacity">
                  <Input
                    id="capacityM3"
                    type="number"
                    placeholder="24"
                    value={formData.capacityM3}
                    onChange={(e) => setField('capacityM3', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-capacity-m3"
                  />
                </Field>
              </div>
            </Card>

            {/* Documents & Compliance */}
            <Card icon={FileText} title="Documents & Compliance" errorCount={errorsBySection.documents}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="insuranceExpiry" label="Insurance / registration expiry" error={errors.insuranceExpiry}>
                  <Input
                    id="insuranceExpiry"
                    type="date"
                    value={formData.insuranceExpiry}
                    onChange={(e) => setField('insuranceExpiry', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-insurance-expiry"
                  />
                </Field>
                <Field id="inspectionExpiry" label="Inspection expiry" error={errors.inspectionExpiry}>
                  <Input
                    id="inspectionExpiry"
                    type="date"
                    value={formData.inspectionExpiry}
                    onChange={(e) => setField('inspectionExpiry', e.target.value)}
                    className="h-[38px]"
                    data-testid="vehicles-inspection-expiry"
                  />
                </Field>
              </div>
            </Card>

            {/* Additional Information */}
            <Card icon={Cog} title="Additional Information" errorCount={errorsBySection.additional}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="fuelType" label="Fuel type" error={errors.fuelType}>
                  <NativeSelect
                    id="fuelType"
                    value={formData.fuelType}
                    onChange={(v) => setField('fuelType', v)}
                    placeholder="Select…"
                  >
                    {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </NativeSelect>
                </Field>
                <Field id="transmission" label="Transmission" error={errors.transmission}>
                  <NativeSelect
                    id="transmission"
                    value={formData.transmission}
                    onChange={(v) => setField('transmission', v)}
                    placeholder="Select…"
                  >
                    {TRANSMISSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </NativeSelect>
                </Field>
                <Field id="axles" label="Axles" error={errors.axles}>
                  <Input
                    id="axles"
                    type="number"
                    placeholder="2"
                    min={1}
                    max={20}
                    value={formData.axles}
                    onChange={(e) => setField('axles', e.target.value)}
                    className="h-[38px]"
                  />
                </Field>

                <Field id="odometer" label="Odometer (km)" error={errors.odometer}>
                  <Input
                    id="odometer"
                    type="number"
                    placeholder="125000"
                    min={0}
                    value={formData.odometer}
                    onChange={(e) => setField('odometer', e.target.value)}
                    className="h-[38px]"
                  />
                </Field>
                <Field id="engineNumber" label="Engine number" error={errors.engineNumber} className="sm:col-span-2">
                  <Input
                    id="engineNumber"
                    placeholder="Engine serial number"
                    value={formData.engineNumber}
                    onChange={(e) => setField('engineNumber', e.target.value)}
                    className="h-[38px]"
                  />
                </Field>

                <Field id="notes" label="Notes" error={errors.notes} className="sm:col-span-3">
                  <div>
                    <textarea
                      id="notes"
                      rows={3}
                      placeholder="Additional notes about this vehicle…"
                      value={formData.notes}
                      onChange={(e) => setField('notes', e.target.value)}
                      className={cn(
                        'flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
                        'placeholder:text-muted-foreground transition-colors',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      )}
                    />
                    <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                      {formData.notes.length}/1000
                    </p>
                  </div>
                </Field>
              </div>
            </Card>
          </div>

          {/* Right: preview sidebar */}
          <div className="hidden flex-[38] flex-col overflow-y-auto border-l border-border/50 bg-muted/10 px-4 py-4 scrollbar-thin lg:flex">
            <VehicleSidebar formData={formData} />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-card px-6 py-3.5">
          <span className={cn(
            'flex items-center gap-1.5 text-xs font-medium',
            errorCount > 0 ? 'text-destructive' : 'text-emerald-500',
          )}>
            {errorCount > 0
              ? <><AlertTriangle className="h-3.5 w-3.5" />{errorCount} field{errorCount !== 1 ? 's' : ''} need attention</>
              : <><BadgeCheck className="h-3.5 w-3.5" />Form is ready</>
            }
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-gradient-brand text-brand-foreground hover:opacity-90"
              disabled={loading}
              onClick={() => void handleSave()}
              data-testid="vehicles-submit-button"
            >
              {loading ? 'Creating…' : 'Create Vehicle'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
