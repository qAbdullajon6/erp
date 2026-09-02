'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  driversAPI,
  useCreateDriver,
  type CreateDriverInput,
  type CreateEmergencyContactInput,
  type Driver,
  type DriverLicenseClass,
  type EmploymentType,
  type WorkShift,
} from '@/lib/api/drivers';
import { DriverAvatarUpload } from '@/components/drivers/driver-avatar';
import { describeError } from '@/lib/api/describe-error';
import { Field, SectionTitle, validateDriverField, validateDriverFields } from '@/components/drivers/driver-form-shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertCircle,
  BadgeCheck,
  Briefcase,
  Check,
  FileText,
  HeartPulse,
  IdCard,
  Phone,
  UserRound,
  X,
} from 'lucide-react';

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Basic Information' },
  { id: 2, label: 'License & Documents' },
  { id: 3, label: 'Employment' },
  { id: 4, label: 'Emergency & Notes' },
] as const;

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

const STEP_REQUIRED: Record<number, string[]> = {
  1: ['firstName', 'lastName', 'phone'],
  2: [], 3: [], 4: [],
};

const STEP_FORMAT_FIELDS: Record<number, string[]> = {
  1: ['firstName', 'lastName', 'phone', 'email', 'employeeCode'],
  2: ['licenseNumber', 'licenseExpiry'],
  3: [], 4: [],
};

const ALL_BASIC_FIELDS = ['firstName', 'lastName', 'phone', 'email', 'employeeCode', 'licenseNumber', 'licenseExpiry'];

// ─── Lookup tables ────────────────────────────────────────────────────────────

const LICENSE_CLASS_LABELS: Record<string, string> = {
  CLASS_A: 'Class A — Motorcycles',
  CLASS_B: 'Class B — Cars & light trucks',
  CLASS_C: 'Class C — Medium trucks',
  CLASS_D: 'Class D — Passenger buses',
  CLASS_E: 'Class E — Trailers',
  CE: 'CE — HGV with trailer',
  OTHER: 'Other',
};
const LICENSE_CLASS_SHORT: Record<string, string> = {
  CLASS_A: 'Class A', CLASS_B: 'Class B', CLASS_C: 'Class C',
  CLASS_D: 'Class D', CLASS_E: 'Class E', CE: 'CE', OTHER: 'Other',
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full Time', PART_TIME: 'Part Time', CONTRACTOR: 'Contractor',
};
const SHIFT_LABELS: Record<string, string> = { DAY: 'Day', NIGHT: 'Night', FLEXIBLE: 'Flexible' };

// ─── Empty state ──────────────────────────────────────────────────────────────

const EMPTY_CONTACT: CreateEmergencyContactInput = {
  name: '', relationship: '', phone: '', alternatePhone: '', email: '', address: '',
};

const EMPTY_FORM: CreateDriverInput = {
  firstName: '', lastName: '', phone: '', email: '', employeeCode: '',
  licenseNumber: '', licenseExpiry: '',
};

type Errors = Record<string, string>;

function stripEmpty<T extends object>(input: T): T {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out as T;
}

function stripEmergency(ec: CreateEmergencyContactInput): CreateEmergencyContactInput | undefined {
  if (!ec.name?.trim() && !ec.phone?.trim() && !ec.relationship?.trim()) return undefined;
  return stripEmpty(ec);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (driver: Driver) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DriversCreateSheet({ open, onOpenChange, onCreated }: Props) {
  const { mutate: create, loading } = useCreateDriver();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<CreateDriverInput>(EMPTY_FORM);
  const [emergencyContact, setEmergencyContact] = useState<CreateEmergencyContactInput>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<Errors>({});
  const [ecErrors, setEcErrors] = useState<Errors>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY_FORM);
      setEmergencyContact(EMPTY_CONTACT);
      setErrors({});
      setEcErrors({});
      setStep(1);
      setPhotoFile(null);
      setPhotoError(null);
    }
  }, [open]);

  const setField = (field: keyof CreateDriverInput, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (typeof value === 'string' && errors[field]) {
      const updated = { ...formData, [field]: value };
      const err = validateDriverField(field, updated);
      setErrors((prev) => { const o = { ...prev }; err ? (o[field] = err) : delete o[field]; return o; });
    }
  };

  const setEcField = (field: keyof CreateEmergencyContactInput, value: string) => {
    setEmergencyContact((prev) => ({ ...prev, [field]: value }));
    if (ecErrors[field]) setEcErrors((prev) => { const o = { ...prev }; delete o[field]; return o; });
  };

  const toggleDay = (day: string) => {
    const current = formData.availableDays ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    setField('availableDays', next.length > 0 ? next : undefined);
  };

  const validateStep = (s: number): boolean => {
    const fmtErrs = validateDriverFields(STEP_FORMAT_FIELDS[s] ?? [], formData);
    const reqErrs: Errors = {};
    for (const f of STEP_REQUIRED[s] ?? []) {
      const v = formData[f as keyof CreateDriverInput];
      if (!v || (typeof v === 'string' && !v.trim())) reqErrs[f] = 'Required';
    }
    const allErrs = { ...fmtErrs, ...reqErrs };
    setErrors((prev) => ({ ...prev, ...allErrs }));
    if (Object.keys(allErrs).length > 0) { toast.error('Please fix the highlighted fields'); return false; }

    if (s === 4) {
      const anyFilled = Object.values(emergencyContact).some((v) => typeof v === 'string' && v.trim());
      if (anyFilled) {
        const ecReq: Errors = {};
        if (!emergencyContact.name?.trim()) ecReq.name = 'Required';
        if (!emergencyContact.relationship?.trim()) ecReq.relationship = 'Required';
        if (!emergencyContact.phone?.trim()) ecReq.phone = 'Required';
        if (Object.keys(ecReq).length > 0) { setEcErrors(ecReq); toast.error('Please fix the highlighted fields'); return false; }
      }
    }
    return true;
  };

  const handleNext = () => { if (validateStep(step)) setStep((p) => Math.min(p + 1, 4)); };
  const handleBack = () => setStep((p) => Math.max(p - 1, 1));

  const handleCreate = async () => {
    const baseErrs = validateDriverFields(ALL_BASIC_FIELDS, formData);
    for (const f of STEP_REQUIRED[1]) {
      const v = formData[f as keyof CreateDriverInput];
      if (!v || (typeof v === 'string' && !v.trim())) baseErrs[f] = 'Required';
    }
    const ecData = stripEmergency(emergencyContact);
    const ecReq: Errors = {};
    if (ecData) {
      if (!emergencyContact.name?.trim()) ecReq.name = 'Required';
      if (!emergencyContact.relationship?.trim()) ecReq.relationship = 'Required';
      if (!emergencyContact.phone?.trim()) ecReq.phone = 'Required';
    }
    setErrors(baseErrs);
    setEcErrors(ecReq);
    if (Object.keys(baseErrs).length > 0 || Object.keys(ecReq).length > 0) {
      toast.error('Fix the highlighted fields');
      return;
    }

    const payload: CreateDriverInput = {
      ...stripEmpty(formData),
      emergencyContact: ecData,
    };
    if (payload.availableDays?.length === 0) delete payload.availableDays;

    try {
      const result = await create(payload);
      let final = result;
      if (photoFile) {
        try {
          final = await driversAPI.uploadPhoto(result.id, photoFile);
        } catch {
          toast.warning('Driver created — photo upload failed. You can add it later in edit.');
        }
      }
      toast.success(`Driver "${final.firstName} ${final.lastName}" created`);
      onCreated?.(final);
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create driver'));
    }
  };

  const initials = `${formData.firstName?.charAt(0) ?? ''}${formData.lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';
  const displayName = [formData.firstName, formData.lastName].filter(Boolean).join(' ') || 'New Driver';

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[900px]" hideCloseButton>
        <DialogTitle className="sr-only">New Driver</DialogTitle>

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">New Driver</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fleet resource for dispatch assignment. Employee code auto-generates if left blank.
            </p>
          </div>
          <button type="button" disabled={loading} onClick={() => !loading && onOpenChange(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground">
            <X className="h-4 w-4" /><span className="sr-only">Close</span>
          </button>
        </div>

        {/* Progress */}
        <div className="shrink-0 border-b border-border/50 px-6 py-3.5">
          <StepProgress current={step} />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 1 && (
            <Step1
              formData={formData}
              errors={errors}
              setField={setField}
              initials={initials}
              displayName={displayName}
              photoFile={photoFile}
              photoError={photoError}
              onPhotoSelected={(f) => { setPhotoFile(f); setPhotoError(null); }}
              onPhotoRemove={() => { setPhotoFile(null); setPhotoError(null); }}
            />
          )}
          {step === 2 && <Step2 formData={formData} errors={errors} setField={setField} />}
          {step === 3 && <Step3 formData={formData} setField={setField} toggleDay={toggleDay} />}
          {step === 4 && (
            <Step4
              formData={formData}
              emergencyContact={emergencyContact}
              ecErrors={ecErrors}
              setEcField={setEcField}
              setField={setField}
              initials={initials}
              displayName={displayName}
              licenseClassShort={LICENSE_CLASS_SHORT}
              employmentLabels={EMPLOYMENT_LABELS}
              shiftLabels={SHIFT_LABELS}
            />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border/60 bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            {step === 1 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => !loading && onOpenChange(false)} disabled={loading}>Cancel</Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={loading}>Back</Button>
            )}
            {step < 4 ? (
              <Button type="button" size="sm" onClick={handleNext} disabled={loading}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90">Next</Button>
            ) : (
              <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={loading}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90">
                {loading ? 'Creating…' : 'Create Driver'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step progress ────────────────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-between">
      {STEPS.map((s, idx) => {
        const done = s.id < current;
        const active = s.id === current;
        return (
          <div key={s.id} className="flex flex-1 items-start">
            <div className="flex flex-col items-center gap-1.5">
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                done && 'bg-success text-white', active && 'bg-brand text-white', !done && !active && 'bg-muted/50 text-muted-foreground/50')}>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.id}
              </span>
              <span className={cn('hidden text-center text-[10px] font-medium leading-tight sm:block max-w-[72px]',
                active ? 'text-foreground' : 'text-muted-foreground/50')}>
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn('mx-1 mt-3.5 h-px flex-1', done ? 'bg-success/60' : 'bg-border/60')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function FormCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border/60 bg-muted/[0.04] p-4 sm:p-5', className)}>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 font-medium text-foreground', mono && 'font-mono text-[11px]')}>{value}</dd>
    </div>
  );
}

// ─── Preview avatar (local file → blob URL) ───────────────────────────────────

function PreviewAvatar({ photoFile, initials }: { photoFile: File | null; initials: string }) {
  const previewUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);
  if (previewUrl) {
    return <img src={previewUrl} alt="Preview" className="h-16 w-16 rounded-full object-cover" />;
  }
  return <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-lg font-bold text-brand">{initials}</span>;
}

// ─── Step 1 — Basic Information ───────────────────────────────────────────────

function Step1({ formData, errors, setField, initials, displayName, photoFile, photoError, onPhotoSelected, onPhotoRemove }: {
  formData: CreateDriverInput; errors: Errors;
  setField: (f: keyof CreateDriverInput, v: unknown) => void;
  initials: string; displayName: string;
  photoFile: File | null;
  photoError: string | null;
  onPhotoSelected: (f: File) => void;
  onPhotoRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-[1fr_240px]">
      <div className="space-y-4">
        <FormCard>
          <SectionTitle icon={UserRound} title="Identity" errors={0} />
          <div className="mt-4 flex gap-4">
            <div className="shrink-0 pt-1">
              <DriverAvatarUpload
                previewFile={photoFile}
                onFileSelected={onPhotoSelected}
                onRemove={onPhotoRemove}
                firstName={formData.firstName}
                lastName={formData.lastName}
                error={photoError}
                size={80}
              />
            </div>
            <div className="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="firstName" label="First name" required error={errors.firstName}>
                <Input id="firstName" value={formData.firstName} onChange={(e) => setField('firstName', e.target.value)}
                  placeholder="Enter first name" className={cn('h-9', errors.firstName && 'border-destructive')} maxLength={100} />
              </Field>
              <Field id="lastName" label="Last name" required error={errors.lastName}>
                <Input id="lastName" value={formData.lastName} onChange={(e) => setField('lastName', e.target.value)}
                  placeholder="Enter last name" className={cn('h-9', errors.lastName && 'border-destructive')} maxLength={100} />
              </Field>
              <Field id="employeeCode" label="Employee code" error={errors.employeeCode} className="sm:col-span-2">
                <Input id="employeeCode" value={formData.employeeCode ?? ''} onChange={(e) => setField('employeeCode', e.target.value)}
                  placeholder="Auto-generated if empty" className={cn('h-9 font-mono', errors.employeeCode && 'border-destructive')} maxLength={50} />
              </Field>
            </div>
          </div>
        </FormCard>
        <FormCard>
          <SectionTitle icon={Phone} title="Contact" errors={0} />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="phone" label="Phone" required error={errors.phone}>
              <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setField('phone', e.target.value)}
                placeholder="+998 90 123 45 67" className={cn('h-9', errors.phone && 'border-destructive')} maxLength={50} />
            </Field>
            <Field id="email" label="Email" error={errors.email}>
              <Input id="email" type="email" value={formData.email ?? ''} onChange={(e) => setField('email', e.target.value)}
                placeholder="Enter email address" className={cn('h-9', errors.email && 'border-destructive')} />
            </Field>
          </div>
        </FormCard>
      </div>

      {/* Driver Preview sidebar */}
      <div className="hidden space-y-3 lg:block">
        <div className="rounded-xl border border-border/60 bg-muted/[0.04] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver Preview</p>
          <div className="flex flex-col items-center gap-2 py-2">
            <PreviewAvatar photoFile={photoFile} initials={initials} />
            <p className="text-sm font-bold text-foreground">{displayName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{formData.employeeCode?.trim() || 'Auto-generated'}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />Active
            </span>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand/25 bg-brand/[0.06] p-2.5 text-[11px] text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            The driver will be available for dispatch after creation.
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/[0.04] p-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quick Tips</p>
          <ul className="space-y-1.5">
            {['Employee code auto-generates if blank.', 'Available for dispatch after creation.', 'License expiry alerts are system-driven.', 'All details editable later.'].map((tip) => (
              <li key={tip} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />{tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2 — License & Documents ────────────────────────────────────────────

function Step2({ formData, errors, setField }: {
  formData: CreateDriverInput; errors: Errors;
  setField: (f: keyof CreateDriverInput, v: unknown) => void;
}) {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">License &amp; Documents</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Add driver license details. Documents can be uploaded after creation.</p>
      </div>

      <FormCard>
        <SectionTitle icon={IdCard} title="License Information" errors={0} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="licenseNumber" label="License number" error={errors.licenseNumber}>
            <Input id="licenseNumber" value={formData.licenseNumber ?? ''} onChange={(e) => setField('licenseNumber', e.target.value)}
              placeholder="e.g. UZ-123456" className={cn('h-9 font-mono', errors.licenseNumber && 'border-destructive')} maxLength={100} />
          </Field>
          <Field id="licenseClass" label="License class">
            <Select value={formData.licenseClass ?? ''} onValueChange={(v) => setField('licenseClass', v || undefined)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {Object.entries(LICENSE_CLASS_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="licenseIssueDate" label="Issue date">
            <Input id="licenseIssueDate" type="date" value={formData.licenseIssueDate ?? ''} onChange={(e) => setField('licenseIssueDate', e.target.value)} className="h-9" />
          </Field>
          <Field id="licenseExpiry" label="Expiry date" error={errors.licenseExpiry}>
            <Input id="licenseExpiry" type="date" value={formData.licenseExpiry ?? ''} onChange={(e) => setField('licenseExpiry', e.target.value)}
              className={cn('h-9', errors.licenseExpiry && 'border-destructive')} />
          </Field>
          <Field id="licenseEndorsements" label="Endorsements / restrictions" className="sm:col-span-2">
            <Input id="licenseEndorsements" value={formData.licenseEndorsements ?? ''} onChange={(e) => setField('licenseEndorsements', e.target.value)}
              placeholder="e.g. Hazmat, No night driving" className="h-9" maxLength={300} />
          </Field>
        </div>
      </FormCard>

      <FormCard>
        <SectionTitle icon={FileText} title="Documents" errors={0} />
        <p className="mt-1 text-xs text-muted-foreground">License details are saved with the driver. Passport, medical certificate, and other documents can be uploaded from the driver profile after creation.</p>
        <div className="mt-4 divide-y divide-border/40">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/30"><FileText className="h-4 w-4 text-muted-foreground" /></span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Driver License</p>
                <p className="font-mono text-[11px] text-muted-foreground">{formData.licenseNumber?.trim() || <span className="italic">Not entered</span>}</p>
                {formData.licenseExpiry && <p className="text-[11px] text-muted-foreground">Expires {formatDate(formData.licenseExpiry)}</p>}
              </div>
            </div>
            {formData.licenseNumber?.trim() ? (
              <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success"><BadgeCheck className="h-3 w-3" /> Entered</span>
            ) : (
              <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">Not entered</span>
            )}
          </div>
        </div>
      </FormCard>
    </div>
  );
}

// ─── Step 3 — Employment ──────────────────────────────────────────────────────

function Step3({ formData, setField, toggleDay }: {
  formData: CreateDriverInput;
  setField: (f: keyof CreateDriverInput, v: unknown) => void;
  toggleDay: (day: string) => void;
}) {
  const selectedDays = formData.availableDays ?? [];
  return (
    <div className="space-y-5 p-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Employment &amp; Work Information</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Set employment details and availability preferences.</p>
      </div>

      <FormCard>
        <SectionTitle icon={Briefcase} title="Employment Details" errors={0} />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="employmentType" label="Employment type">
            <Select value={formData.employmentType ?? ''} onValueChange={(v) => setField('employmentType', v as EmploymentType || undefined)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_TIME">Full Time</SelectItem>
                <SelectItem value="PART_TIME">Part Time</SelectItem>
                <SelectItem value="CONTRACTOR">Contractor</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="hireDate" label="Hire date">
            <Input id="hireDate" type="date" value={formData.hireDate ?? ''} onChange={(e) => setField('hireDate', e.target.value)} className="h-9" />
          </Field>
          <Field id="department" label="Department / Team">
            <Input id="department" value={formData.department ?? ''} onChange={(e) => setField('department', e.target.value)}
              placeholder="e.g. Regional Logistics" className="h-9" maxLength={100} />
          </Field>
          <Field id="workShift" label="Work shift">
            <Select value={formData.workShift ?? ''} onValueChange={(v) => setField('workShift', v as WorkShift || undefined)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="NIGHT">Night</SelectItem>
                <SelectItem value="FLEXIBLE">Flexible</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="baseLocation" label="Base location" className="sm:col-span-2">
            <Input id="baseLocation" value={formData.baseLocation ?? ''} onChange={(e) => setField('baseLocation', e.target.value)}
              placeholder="e.g. Tashkent Depot" className="h-9" maxLength={100} />
          </Field>
        </div>
      </FormCard>

      <FormCard>
        <SectionTitle icon={Briefcase} title="Work Preferences" errors={0} />
        <div className="mt-4 space-y-4">
          <Field id="preferredRegions" label="Preferred routes / regions">
            <Input id="preferredRegions" value={formData.preferredRegions ?? ''} onChange={(e) => setField('preferredRegions', e.target.value)}
              placeholder="e.g. Tashkent, Samarkand, Bukhara" className="h-9" maxLength={500} />
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Available days</p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => {
                const active = selectedDays.includes(day);
                return (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={cn('h-8 min-w-[44px] rounded-md px-3 text-xs font-semibold transition-all',
                      active ? 'bg-brand text-brand-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50')}>
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
            {selectedDays.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">Selected: {selectedDays.map((d) => DAY_LABELS[d] ?? d).join(', ')}</p>
            )}
          </div>
          <Field id="driverNotes" label="Driver notes">
            <Textarea id="driverNotes" value={formData.driverNotes ?? ''} onChange={(e) => setField('driverNotes', e.target.value)}
              placeholder="General driver information…" className="min-h-[80px] resize-none text-sm" maxLength={2000} />
          </Field>
        </div>
      </FormCard>
    </div>
  );
}

// ─── Step 4 — Emergency & Notes ───────────────────────────────────────────────

function Step4({ formData, emergencyContact, ecErrors, setEcField, setField, initials, displayName, licenseClassShort, employmentLabels, shiftLabels }: {
  formData: CreateDriverInput;
  emergencyContact: CreateEmergencyContactInput;
  ecErrors: Errors;
  setEcField: (f: keyof CreateEmergencyContactInput, v: string) => void;
  setField: (f: keyof CreateDriverInput, v: unknown) => void;
  initials: string;
  displayName: string;
  licenseClassShort: Record<string, string>;
  employmentLabels: Record<string, string>;
  shiftLabels: Record<string, string>;
}) {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Emergency Contact &amp; Notes</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Add an emergency contact and internal notes, then review before creating.</p>
      </div>

      <FormCard>
        <SectionTitle icon={HeartPulse} title="Emergency Contact" errors={0} />
        <p className="mt-1 text-xs text-muted-foreground">If any field is filled, name, relationship and phone become required.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="ec-name" label="Contact name" error={ecErrors.name}>
            <Input id="ec-name" value={emergencyContact.name} onChange={(e) => setEcField('name', e.target.value)}
              placeholder="Full name" className={cn('h-9', ecErrors.name && 'border-destructive')} maxLength={150} />
          </Field>
          <Field id="ec-relationship" label="Relationship" error={ecErrors.relationship}>
            <Input id="ec-relationship" value={emergencyContact.relationship} onChange={(e) => setEcField('relationship', e.target.value)}
              placeholder="e.g. Spouse, Parent, Sibling" className={cn('h-9', ecErrors.relationship && 'border-destructive')} maxLength={100} />
          </Field>
          <Field id="ec-phone" label="Phone" error={ecErrors.phone}>
            <Input id="ec-phone" type="tel" value={emergencyContact.phone} onChange={(e) => setEcField('phone', e.target.value)}
              placeholder="+998 90 000 00 00" className={cn('h-9', ecErrors.phone && 'border-destructive')} maxLength={50} />
          </Field>
          <Field id="ec-altPhone" label="Alternative phone">
            <Input id="ec-altPhone" type="tel" value={emergencyContact.alternatePhone ?? ''} onChange={(e) => setEcField('alternatePhone', e.target.value)}
              placeholder="+998 90 000 00 00" className="h-9" maxLength={50} />
          </Field>
          <Field id="ec-email" label="Email">
            <Input id="ec-email" type="email" value={emergencyContact.email ?? ''} onChange={(e) => setEcField('email', e.target.value)}
              placeholder="email@example.com" className="h-9" />
          </Field>
          <Field id="ec-address" label="Address">
            <Input id="ec-address" value={emergencyContact.address ?? ''} onChange={(e) => setEcField('address', e.target.value)}
              placeholder="City, street address" className="h-9" maxLength={300} />
          </Field>
        </div>
      </FormCard>

      <FormCard>
        <SectionTitle icon={FileText} title="Internal Notes" errors={0} />
        <p className="mt-1 text-xs text-muted-foreground">Private operational notes — visible only to authorized staff.</p>
        <div className="mt-4">
          <Textarea value={formData.internalNotes ?? ''} onChange={(e) => setField('internalNotes', e.target.value)}
            placeholder="Internal operational notes…" className="min-h-[80px] resize-none text-sm" maxLength={2000} />
        </div>
      </FormCard>

      {/* Driver Summary */}
      <FormCard>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">{initials}</span>
          <div>
            <p className="text-base font-bold text-foreground">{displayName}</p>
            <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />Active
            </span>
          </div>
        </div>
        <p className="mb-3 mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Driver Summary</p>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-3">
          <SummaryRow label="Name" value={displayName} />
          <SummaryRow label="Employee Code" value={formData.employeeCode?.trim() || 'Auto-generated'} mono />
          <SummaryRow label="Phone" value={formData.phone || '—'} />
          <SummaryRow label="Email" value={formData.email?.trim() || '—'} />
          <SummaryRow label="License" value={formData.licenseNumber?.trim() || '—'} mono />
          <SummaryRow label="License Expiry" value={formData.licenseExpiry ? formatDate(formData.licenseExpiry) : '—'} />
          <SummaryRow label="License Class" value={formData.licenseClass ? (licenseClassShort[formData.licenseClass] ?? formData.licenseClass) : '—'} />
          <SummaryRow label="Employment" value={formData.employmentType ? (employmentLabels[formData.employmentType] ?? formData.employmentType) : '—'} />
          <SummaryRow label="Hire Date" value={formData.hireDate ? formatDate(formData.hireDate) : '—'} />
          <SummaryRow label="Base Location" value={formData.baseLocation?.trim() || '—'} />
          <SummaryRow label="Shift" value={formData.workShift ? (shiftLabels[formData.workShift] ?? formData.workShift) : '—'} />
          <SummaryRow label="Emergency Contact" value={emergencyContact.name?.trim() ? `${emergencyContact.name}${emergencyContact.relationship ? ` (${emergencyContact.relationship})` : ''}` : '—'} />
        </dl>
      </FormCard>

      <div className="flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 text-xs text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
        <p>Click <strong className="text-foreground">Create Driver</strong> to add this driver to your fleet. They will be immediately available for dispatch assignment.</p>
      </div>
    </div>
  );
}
