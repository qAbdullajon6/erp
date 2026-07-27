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
import { useCreateDriver, type CreateDriverInput, type Driver } from '@/lib/api/drivers';
import { cn } from '@/lib/utils';
import { CreditCard, IdCard, Phone, User } from 'lucide-react';
import { toast } from 'sonner';

type SectionKey = 'identity' | 'contact' | 'license';

const FIELD_SECTION: Record<string, SectionKey> = {
  employeeCode: 'identity',
  firstName: 'identity',
  lastName: 'identity',
  phone: 'contact',
  email: 'contact',
  licenseNumber: 'license',
  licenseExpiry: 'license',
};

type Errors = Record<string, string>;

function stripEmpty(input: CreateDriverInput): CreateDriverInput {
  const cleaned = { ...input };
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'string' && value.trim() === '') {
      delete cleaned[key as keyof CreateDriverInput];
    }
  }
  return cleaned;
}

function validateField(field: string, data: CreateDriverInput): string | null {
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

const ALL_FIELDS = Object.keys(FIELD_SECTION);

const EMPTY: CreateDriverInput = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  employeeCode: '',
  licenseNumber: '',
  licenseExpiry: '',
};

function Field({
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (driver: Driver) => void;
}

/// Create uses the same right Sheet pattern as Orders / Customers (~780px, sticky footer).
/// Only fields accepted by CreateDriverDto — no employment / emergency / notes invention.
export function DriversCreateSheet({ open, onOpenChange, onCreated }: Props) {
  const { mutate: create, loading } = useCreateDriver();
  const [formData, setFormData] = useState<CreateDriverInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY);
      setErrors({});
    }
  }, [open]);

  const setField = (field: keyof CreateDriverInput, value: string) => {
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
    const counts: Record<SectionKey, number> = { identity: 0, contact: 0, license: 0 };
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
      const result = await create(stripEmpty(formData));
      toast.success(`Driver "${result.firstName} ${result.lastName}" created`);
      onCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create driver');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New driver</SheetTitle>
          <SheetDescription className="text-xs">
            Fleet resource for dispatch assignment. Employee code auto-generates if left blank.
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
                    value={formData.firstName}
                    onChange={(e) => setField('firstName', e.target.value)}
                    className={cn('h-9', errors.firstName && 'border-destructive')}
                    maxLength={100}
                  />
                </Field>
                <Field id="lastName" label="Last name" required error={errors.lastName}>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setField('lastName', e.target.value)}
                    className={cn('h-9', errors.lastName && 'border-destructive')}
                    maxLength={100}
                  />
                </Field>
                <Field id="employeeCode" label="Employee code" error={errors.employeeCode} className="sm:col-span-2">
                  <Input
                    id="employeeCode"
                    value={formData.employeeCode ?? ''}
                    onChange={(e) => setField('employeeCode', e.target.value)}
                    placeholder="Auto-generated if empty"
                    className={cn('h-9 font-mono', errors.employeeCode && 'border-destructive')}
                    maxLength={50}
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
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className={cn('h-9', errors.phone && 'border-destructive')}
                    maxLength={50}
                  />
                </Field>
                <Field id="email" label="Email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email ?? ''}
                    onChange={(e) => setField('email', e.target.value)}
                    className={cn('h-9', errors.email && 'border-destructive')}
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/60 pt-5 pb-2">
              <SectionTitle icon={IdCard} title="License" errors={errorsBySection.license} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="licenseNumber" label="License number" error={errors.licenseNumber}>
                  <Input
                    id="licenseNumber"
                    value={formData.licenseNumber ?? ''}
                    onChange={(e) => setField('licenseNumber', e.target.value)}
                    className={cn('h-9 font-mono', errors.licenseNumber && 'border-destructive')}
                    maxLength={100}
                  />
                </Field>
                <Field id="licenseExpiry" label="License expiry" error={errors.licenseExpiry}>
                  <Input
                    id="licenseExpiry"
                    type="date"
                    value={formData.licenseExpiry ?? ''}
                    onChange={(e) => setField('licenseExpiry', e.target.value)}
                    className={cn('h-9', errors.licenseExpiry && 'border-destructive')}
                  />
                </Field>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <CreditCard className="mt-0.5 h-3 w-3 shrink-0" />
                Employment, emergency contact, and notes are not on the drivers API yet.
              </p>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={loading}>
              {loading ? 'Creating…' : 'Create Driver'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  errors,
}: {
  icon: typeof User;
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
