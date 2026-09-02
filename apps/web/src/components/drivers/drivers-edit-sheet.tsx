'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  driversAPI,
  useUpdateDriver,
  type CreateEmergencyContactInput,
  type Driver,
  type DriverLicenseClass,
  type DriverStatus,
  type EmploymentType,
  type UpdateDriverInput,
  type WorkShift,
} from '@/lib/api/drivers';
import { DriverAvatarUpload } from '@/components/drivers/driver-avatar';
import { describeError } from '@/lib/api/describe-error';
import {
  DRIVER_FIELD_SECTION,
  Field,
  SectionTitle,
  emptySectionCounts,
  validateDriverField,
  validateDriverFields,
} from '@/components/drivers/driver-form-shared';
import { cn } from '@/lib/utils';
import { Briefcase, HeartPulse, IdCard, Phone, User } from 'lucide-react';
import { toast } from 'sonner';

type Errors = Record<string, string>;

type EditForm = UpdateDriverInput & {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  employeeCode?: string;
  licenseNumber?: string;
  licenseClass?: DriverLicenseClass;
  licenseIssueDate?: string;
  licenseExpiry?: string;
  licenseEndorsements?: string;
  employmentType?: EmploymentType;
  hireDate?: string;
  department?: string;
  baseLocation?: string;
  workShift?: WorkShift;
  preferredRegions?: string;
  availableDays?: string[];
  driverNotes?: string;
  internalNotes?: string;
  status?: DriverStatus;
};

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

const EMPTY_EC: CreateEmergencyContactInput = {
  name: '', relationship: '', phone: '', alternatePhone: '', email: '', address: '',
};

function toForm(driver: Driver): EditForm {
  return {
    employeeCode: driver.employeeCode,
    firstName: driver.firstName,
    lastName: driver.lastName,
    phone: driver.phone,
    email: driver.email ?? '',
    licenseNumber: driver.licenseNumber ?? '',
    licenseClass: driver.licenseClass ?? undefined,
    licenseIssueDate: driver.licenseIssueDate?.slice(0, 10) ?? '',
    licenseExpiry: driver.licenseExpiry?.slice(0, 10) ?? '',
    licenseEndorsements: driver.licenseEndorsements ?? '',
    employmentType: driver.employmentType ?? undefined,
    hireDate: driver.hireDate?.slice(0, 10) ?? '',
    department: driver.department ?? '',
    baseLocation: driver.baseLocation ?? '',
    workShift: driver.workShift ?? undefined,
    preferredRegions: driver.preferredRegions ?? '',
    availableDays: driver.availableDays ?? [],
    driverNotes: driver.driverNotes ?? '',
    internalNotes: driver.internalNotes ?? '',
    status: driver.status,
  };
}

function toEC(driver: Driver): CreateEmergencyContactInput {
  const ec = driver.emergencyContact;
  if (!ec) return EMPTY_EC;
  return {
    name: ec.name,
    relationship: ec.relationship,
    phone: ec.phone,
    alternatePhone: ec.alternatePhone ?? '',
    email: ec.email ?? '',
    address: ec.address ?? '',
  };
}

const ALL_FIELDS = Object.keys(DRIVER_FIELD_SECTION);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver;
}

export function DriversEditSheet({ open, onOpenChange, driver }: Props) {
  const { mutate: update, loading } = useUpdateDriver(driver.id);
  const [formData, setFormData] = useState<EditForm>(() => toForm(driver));
  const [ec, setEc] = useState<CreateEmergencyContactInput>(() => toEC(driver));
  const [errors, setErrors] = useState<Errors>({});
  const [ecErrors, setEcErrors] = useState<Errors>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoAction, setPhotoAction] = useState<'none' | 'remove'>('none');
  const bodyRef = useRef<HTMLDivElement>(null);
  const archived = Boolean(driver.archivedAt);

  useEffect(() => {
    if (open) {
      setFormData(toForm(driver));
      setEc(toEC(driver));
      setErrors({});
      setEcErrors({});
      setPhotoFile(null);
      setPhotoAction('none');
    }
  }, [open, driver]);

  const setField = (field: keyof EditForm, value: unknown) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    if (typeof value === 'string') {
      setErrors((prev) => {
        const out = { ...prev };
        const err = validateDriverField(field, next);
        if (err) out[field] = err;
        else delete out[field];
        return out;
      });
    }
  };

  const setEcField = (field: keyof CreateEmergencyContactInput, value: string) => {
    setEc((prev) => ({ ...prev, [field]: value }));
    if (ecErrors[field]) setEcErrors((prev) => { const o = { ...prev }; delete o[field]; return o; });
  };

  const toggleDay = (day: string) => {
    const current = formData.availableDays ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    setField('availableDays', next);
  };

  const errorsBySection = useMemo(() => {
    const counts = emptySectionCounts();
    for (const field of Object.keys(errors)) {
      const section = DRIVER_FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const handleSave = async () => {
    const all = validateDriverFields(ALL_FIELDS, formData);
    setErrors(all);

    const ecErrors: Errors = {};
    const anyEcFilled = Object.values(ec).some((v) => typeof v === 'string' && v.trim());
    if (anyEcFilled) {
      if (!ec.name?.trim()) ecErrors.name = 'Required';
      if (!ec.relationship?.trim()) ecErrors.relationship = 'Required';
      if (!ec.phone?.trim()) ecErrors.phone = 'Required';
    }
    setEcErrors(ecErrors);

    if (Object.keys(all).length > 0 || Object.keys(ecErrors).length > 0) {
      toast.error('Fix the highlighted fields');
      return;
    }

    const strip = (v: string | undefined) => (v?.trim() || undefined);

    const emergencyContact = anyEcFilled ? {
      name: ec.name.trim(),
      relationship: ec.relationship.trim(),
      phone: ec.phone.trim(),
      alternatePhone: strip(ec.alternatePhone),
      email: strip(ec.email),
      address: strip(ec.address),
    } : undefined;

    try {
      await update({
        employeeCode: formData.employeeCode,
        firstName: formData.firstName?.trim(),
        lastName: formData.lastName?.trim(),
        phone: formData.phone?.trim(),
        email: strip(formData.email),
        status: formData.status,
        employmentType: formData.employmentType || undefined,
        hireDate: formData.hireDate || undefined,
        department: strip(formData.department),
        baseLocation: strip(formData.baseLocation),
        workShift: formData.workShift || undefined,
        preferredRegions: strip(formData.preferredRegions),
        availableDays: (formData.availableDays?.length ?? 0) > 0 ? formData.availableDays : undefined,
        driverNotes: strip(formData.driverNotes),
        internalNotes: strip(formData.internalNotes),
        emergencyContact,
      });
      if (photoAction === 'remove') {
        try { await driversAPI.removePhoto(driver.id); } catch { /* best-effort */ }
      } else if (photoFile) {
        try { await driversAPI.uploadPhoto(driver.id, photoFile); } catch {
          toast.warning('Driver saved — photo upload failed');
        }
      }
      toast.success('Driver updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update driver'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">
            Edit {driver.firstName} {driver.lastName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {driver.employeeCode}
            {archived ? ' · Restore from detail before editing.' : ''}
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">

            {/* Identity */}
            <section className="space-y-3">
              <SectionTitle icon={User} title="Identity" errors={errorsBySection.identity} />
              <div className="flex gap-4">
                <div className="shrink-0 pt-1">
                  <DriverAvatarUpload
                    existingPhotoUrl={photoAction === 'remove' ? null : driver.profilePhotoUrl}
                    previewFile={photoFile}
                    onFileSelected={(f) => { setPhotoFile(f); setPhotoAction('none'); }}
                    onRemove={() => { setPhotoFile(null); setPhotoAction('remove'); }}
                    firstName={formData.firstName ?? driver.firstName}
                    lastName={formData.lastName ?? driver.lastName}
                    size={72}
                  />
                </div>
                <div className="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field id="firstName" label="First name" required error={errors.firstName}>
                    <Input id="firstName" value={formData.firstName ?? ''} onChange={(e) => setField('firstName', e.target.value)}
                      className={cn('h-9', errors.firstName && 'border-destructive')} disabled={archived} />
                  </Field>
                  <Field id="lastName" label="Last name" required error={errors.lastName}>
                    <Input id="lastName" value={formData.lastName ?? ''} onChange={(e) => setField('lastName', e.target.value)}
                      className={cn('h-9', errors.lastName && 'border-destructive')} disabled={archived} />
                  </Field>
                  <Field id="employeeCode" label="Employee code" error={errors.employeeCode} className="sm:col-span-2">
                    <Input id="employeeCode" value={formData.employeeCode ?? ''} onChange={(e) => setField('employeeCode', e.target.value)}
                      className={cn('h-9 font-mono', errors.employeeCode && 'border-destructive')} disabled={archived} />
                  </Field>
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={Phone} title="Contact" errors={errorsBySection.contact} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="phone" label="Phone" required error={errors.phone}>
                  <Input id="phone" value={formData.phone ?? ''} onChange={(e) => setField('phone', e.target.value)}
                    className={cn('h-9', errors.phone && 'border-destructive')} disabled={archived} />
                </Field>
                <Field id="email" label="Email" error={errors.email}>
                  <Input id="email" type="email" value={formData.email ?? ''} onChange={(e) => setField('email', e.target.value)}
                    className={cn('h-9', errors.email && 'border-destructive')} disabled={archived} />
                </Field>
              </div>
            </section>

            {/* License — read-only; managed via Documents section */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={IdCard} title="License" errors={0} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="licenseNumber" label="License number">
                  <Input id="licenseNumber" value={formData.licenseNumber ?? ''} readOnly
                    className="h-9 cursor-default font-mono bg-muted/40" />
                </Field>
                <Field id="licenseClass" label="License class">
                  <Input value={formData.licenseClass ? formData.licenseClass.replace('_', ' ') : '—'} readOnly
                    className="h-9 cursor-default bg-muted/40" />
                </Field>
                <Field id="licenseIssueDate" label="Issue date">
                  <Input id="licenseIssueDate" type="text" value={formData.licenseIssueDate ?? ''} readOnly
                    className="h-9 cursor-default bg-muted/40" />
                </Field>
                <Field id="licenseExpiry" label="Expiry date">
                  <Input id="licenseExpiry" type="text" value={formData.licenseExpiry ?? ''} readOnly
                    className="h-9 cursor-default bg-muted/40" />
                </Field>
                <Field id="licenseEndorsements" label="Endorsements" className="sm:col-span-2">
                  <Input id="licenseEndorsements" value={formData.licenseEndorsements ?? ''} readOnly
                    className="h-9 cursor-default bg-muted/40" />
                </Field>
              </div>
              <p className="text-[11px] text-muted-foreground">
                License details are synced from the <strong>Driver License</strong> document. To edit, use the Documents section on the driver profile.
              </p>
            </section>

            {/* Employment */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={Briefcase} title="Employment" errors={0} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="employmentType" label="Employment type">
                  <Select value={formData.employmentType ?? ''} onValueChange={(v) => setField('employmentType', v || undefined)} disabled={archived}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full Time</SelectItem>
                      <SelectItem value="PART_TIME">Part Time</SelectItem>
                      <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="hireDate" label="Hire date">
                  <Input id="hireDate" type="date" value={formData.hireDate ?? ''} onChange={(e) => setField('hireDate', e.target.value)}
                    className="h-9" disabled={archived} />
                </Field>
                <Field id="department" label="Department">
                  <Input id="department" value={formData.department ?? ''} onChange={(e) => setField('department', e.target.value)}
                    placeholder="e.g. Logistics" className="h-9" disabled={archived} />
                </Field>
                <Field id="workShift" label="Work shift">
                  <Select value={formData.workShift ?? ''} onValueChange={(v) => setField('workShift', v || undefined)} disabled={archived}>
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
                    placeholder="e.g. Tashkent depot" className="h-9" disabled={archived} />
                </Field>
              </div>
            </section>

            {/* Work Preferences */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Preferences</p>
              <div className="space-y-3">
                <Field id="preferredRegions" label="Preferred regions">
                  <Input id="preferredRegions" value={formData.preferredRegions ?? ''} onChange={(e) => setField('preferredRegions', e.target.value)}
                    placeholder="e.g. Tashkent, Samarkand" className="h-9" disabled={archived} />
                </Field>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-foreground">Available days</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day) => {
                      const active = (formData.availableDays ?? []).includes(day);
                      return (
                        <button key={day} type="button" disabled={archived}
                          onClick={() => toggleDay(day)}
                          className={cn('h-7 min-w-[40px] rounded-full px-2.5 text-[11px] font-semibold transition-colors',
                            active ? 'bg-brand text-white' : 'border border-border bg-muted/30 text-muted-foreground hover:border-brand/50 hover:text-foreground',
                          )}>
                          {DAY_LABELS[day]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Field id="driverNotes" label="Driver notes">
                  <Textarea id="driverNotes" value={formData.driverNotes ?? ''} onChange={(e) => setField('driverNotes', e.target.value)}
                    placeholder="Notes visible to operations team" className="resize-none" rows={2} disabled={archived} />
                </Field>
              </div>
            </section>

            {/* Internal Notes */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal Notes</p>
              <Textarea value={formData.internalNotes ?? ''} onChange={(e) => setField('internalNotes', e.target.value)}
                placeholder="Internal admin notes (not visible to driver)" className="resize-none" rows={3} disabled={archived} />
            </section>

            {/* Emergency Contact */}
            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={HeartPulse} title="Emergency Contact" errors={Object.keys(ecErrors).length} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="ec-name" label="Full name" required={Boolean(ec.relationship || ec.phone)} error={ecErrors.name}>
                  <Input id="ec-name" value={ec.name} onChange={(e) => setEcField('name', e.target.value)}
                    placeholder="Contact name" className={cn('h-9', ecErrors.name && 'border-destructive')} disabled={archived} />
                </Field>
                <Field id="ec-relationship" label="Relationship" required={Boolean(ec.name || ec.phone)} error={ecErrors.relationship}>
                  <Input id="ec-relationship" value={ec.relationship} onChange={(e) => setEcField('relationship', e.target.value)}
                    placeholder="e.g. Spouse, Parent" className={cn('h-9', ecErrors.relationship && 'border-destructive')} disabled={archived} />
                </Field>
                <Field id="ec-phone" label="Phone" required={Boolean(ec.name || ec.relationship)} error={ecErrors.phone}>
                  <Input id="ec-phone" type="tel" value={ec.phone} onChange={(e) => setEcField('phone', e.target.value)}
                    placeholder="+998 90 123 45 67" className={cn('h-9', ecErrors.phone && 'border-destructive')} disabled={archived} />
                </Field>
                <Field id="ec-altPhone" label="Alternate phone">
                  <Input id="ec-altPhone" type="tel" value={ec.alternatePhone ?? ''} onChange={(e) => setEcField('alternatePhone', e.target.value)}
                    placeholder="Optional" className="h-9" disabled={archived} />
                </Field>
                <Field id="ec-email" label="Email">
                  <Input id="ec-email" type="email" value={ec.email ?? ''} onChange={(e) => setEcField('email', e.target.value)}
                    placeholder="Optional" className="h-9" disabled={archived} />
                </Field>
                <Field id="ec-address" label="Address">
                  <Input id="ec-address" value={ec.address ?? ''} onChange={(e) => setEcField('address', e.target.value)}
                    placeholder="Optional" className="h-9" disabled={archived} />
                </Field>
              </div>
            </section>

            {/* Status */}
            {!archived && (
              <section className="space-y-3 border-t border-border/60 pt-5 pb-2">
                <SectionTitle icon={User} title="Status" errors={errorsBySection.status} />
                <Field id="status" label="Employment status">
                  <Select value={formData.status ?? 'ACTIVE'} onValueChange={(v) => setField('status', v)}>
                    <SelectTrigger id="status" className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="ON_LEAVE">On leave</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <p className="text-[11px] text-muted-foreground">
                  Inactive / On leave block new assignments. Archive hides the driver from the default list.
                </p>
              </section>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading || archived}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
