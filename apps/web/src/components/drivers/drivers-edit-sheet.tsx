'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  useUpdateDriver,
  type Driver,
  type DriverStatus,
  type UpdateDriverInput,
} from '@/lib/api/drivers';
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
import { IdCard, Phone, User } from 'lucide-react';
import { toast } from 'sonner';

type Errors = Record<string, string>;
type EditForm = UpdateDriverInput & {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  employeeCode?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  status?: DriverStatus;
};

function toForm(driver: Driver): EditForm {
  return {
    employeeCode: driver.employeeCode,
    firstName: driver.firstName,
    lastName: driver.lastName,
    phone: driver.phone,
    email: driver.email ?? '',
    licenseNumber: driver.licenseNumber ?? '',
    licenseExpiry: driver.licenseExpiry?.slice(0, 10) ?? '',
    status: driver.status,
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
  const [errors, setErrors] = useState<Errors>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const archived = Boolean(driver.archivedAt);

  useEffect(() => {
    if (open) {
      setFormData(toForm(driver));
      setErrors({});
    }
  }, [open, driver]);

  const setField = (field: keyof EditForm, value: string) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setErrors((prev) => {
      const out = { ...prev };
      const err = validateDriverField(field, next);
      if (err) out[field] = err;
      else delete out[field];
      return out;
    });
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
    if (Object.keys(all).length > 0) {
      toast.error('Fix the highlighted fields');
      return;
    }
    try {
      await update({
        employeeCode: formData.employeeCode,
        firstName: formData.firstName?.trim(),
        lastName: formData.lastName?.trim(),
        phone: formData.phone?.trim(),
        email: formData.email?.trim() || undefined,
        licenseNumber: formData.licenseNumber?.trim() || undefined,
        licenseExpiry: formData.licenseExpiry || undefined,
        status: formData.status,
      });
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
            <section className="space-y-3">
              <SectionTitle icon={User} title="Identity" errors={errorsBySection.identity} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="firstName" label="First name" required error={errors.firstName}>
                  <Input
                    id="firstName"
                    value={formData.firstName ?? ''}
                    onChange={(e) => setField('firstName', e.target.value)}
                    className={cn('h-9', errors.firstName && 'border-destructive')}
                    disabled={archived}
                  />
                </Field>
                <Field id="lastName" label="Last name" required error={errors.lastName}>
                  <Input
                    id="lastName"
                    value={formData.lastName ?? ''}
                    onChange={(e) => setField('lastName', e.target.value)}
                    className={cn('h-9', errors.lastName && 'border-destructive')}
                    disabled={archived}
                  />
                </Field>
                <Field id="employeeCode" label="Employee code" error={errors.employeeCode} className="sm:col-span-2">
                  <Input
                    id="employeeCode"
                    value={formData.employeeCode ?? ''}
                    onChange={(e) => setField('employeeCode', e.target.value)}
                    className={cn('h-9 font-mono', errors.employeeCode && 'border-destructive')}
                    disabled={archived}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={Phone} title="Contact" errors={errorsBySection.contact} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="phone" label="Phone" required error={errors.phone}>
                  <Input
                    id="phone"
                    value={formData.phone ?? ''}
                    onChange={(e) => setField('phone', e.target.value)}
                    className={cn('h-9', errors.phone && 'border-destructive')}
                    disabled={archived}
                  />
                </Field>
                <Field id="email" label="Email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email ?? ''}
                    onChange={(e) => setField('email', e.target.value)}
                    className={cn('h-9', errors.email && 'border-destructive')}
                    disabled={archived}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5">
              <SectionTitle icon={IdCard} title="License" errors={errorsBySection.license} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="licenseNumber" label="License number" error={errors.licenseNumber}>
                  <Input
                    id="licenseNumber"
                    value={formData.licenseNumber ?? ''}
                    onChange={(e) => setField('licenseNumber', e.target.value)}
                    className="h-9 font-mono"
                    disabled={archived}
                  />
                </Field>
                <Field id="licenseExpiry" label="License expiry" error={errors.licenseExpiry}>
                  <Input
                    id="licenseExpiry"
                    type="date"
                    value={formData.licenseExpiry ?? ''}
                    onChange={(e) => setField('licenseExpiry', e.target.value)}
                    className={cn('h-9', errors.licenseExpiry && 'border-destructive')}
                    disabled={archived}
                  />
                </Field>
              </div>
            </section>

            {!archived && (
              <section className="space-y-3 border-t border-border/60 pt-5 pb-2">
                <SectionTitle icon={User} title="Status" errors={errorsBySection.status} />
                <Field id="status" label="Employment status">
                  <Select
                    value={formData.status ?? 'ACTIVE'}
                    onValueChange={(v) => setField('status', v)}
                  >
                    <SelectTrigger id="status" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
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
