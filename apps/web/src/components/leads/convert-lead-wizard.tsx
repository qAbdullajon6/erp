'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useConvertLeadMutation,
  type ConvertLeadInput,
  type ConvertPlanChoice,
} from '@/lib/api/platform';
import type { Lead } from '@/lib/api/leads';
import { CURRENCIES, timezoneOptions } from '@/lib/locale';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 1, label: 'Organization' },
  { id: 2, label: 'Plan' },
  { id: 3, label: 'Admin invite' },
  { id: 4, label: 'Review' },
] as const;

const PLANS: { id: ConvertPlanChoice; name: string; blurb: string }[] = [
  { id: 'trial', name: 'Trial', blurb: 'Time-boxed evaluation on Starter features.' },
  { id: 'starter', name: 'Starter', blurb: 'Small teams getting operations online.' },
  { id: 'professional', name: 'Professional', blurb: 'Growing fleets and multi-dispatcher teams.' },
  { id: 'enterprise', name: 'Enterprise', blurb: 'Large orgs with custom limits and support.' },
];

const TIMEZONES = timezoneOptions().map((option) => option.value);

function slugifyClient(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: 'Admin' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function ConvertLeadWizard({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { mutateAsync: convertLead, isPending } = useConvertLeadMutation();
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState('Asia/Tashkent');
  const [currency, setCurrency] = useState('USD');
  const [plan, setPlan] = useState<ConvertPlanChoice>('trial');
  const [trialDays, setTrialDays] = useState(14);
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');


  const resetFromLead = (next: Lead | null) => {
    setStep(1);
    if (!next) return;
    setOrgName(next.company);
    setSlug(slugifyClient(next.company));
    setSlugTouched(false);
    setTimezone('Asia/Tashkent');
    setCurrency('USD');
    setPlan('trial');
    setTrialDays(14);
    const names = splitName(next.name);
    setAdminFirstName(names.first);
    setAdminLastName(names.last);
    setAdminEmail(next.email);
  };

  useEffect(() => {
    if (open && lead) resetFromLead(lead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id]);

  if (!lead) return null;

  const canStep1 = orgName.trim().length >= 2 && slug.trim().length >= 2;
  const canStep2 = plan !== 'trial' || (trialDays >= 1 && trialDays <= 90);
  const canStep3 =
    adminFirstName.trim().length >= 1 &&
    adminLastName.trim().length >= 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim());

  const payload: ConvertLeadInput = {
    organizationName: orgName.trim(),
    slug: slug.trim(),
    timezone,
    currency,
    plan,
    trialDays: plan === 'trial' ? trialDays : undefined,
    adminFirstName: adminFirstName.trim(),
    adminLastName: adminLastName.trim(),
    adminEmail: adminEmail.trim().toLowerCase(),
  };

  const goNext = () => {
    if (step === 1 && !canStep1) return;
    if (step === 2 && !canStep2) return;
    if (step === 3 && !canStep3) return;
    setStep((s) => Math.min(4, s + 1));
  };

  const finish = async () => {
    try {
      const result = await convertLead({ id: lead.id, body: payload });
      if (result.invitation.emailSent) {
        toast.success('Organization successfully created. Admin invitation sent.');
      } else {
        const link = result.invitation.acceptUrl;
        toast.warning('Invitation created but email could not be sent.', {
          duration: 14_000,
          action: link
            ? {
                label: 'Copy link',
                onClick: () => {
                  void navigator.clipboard.writeText(link);
                  toast.success('Invitation link copied');
                },
              }
            : undefined,
        });
      }
      onOpenChange(false);
      navigate({ to: '/platform/organizations/$orgId', params: { orgId: result.organization.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert lead');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle>Convert lead</DialogTitle>
          <DialogDescription>
            Create an organization, subscription, and admin invitation for {lead.company}.
          </DialogDescription>
          <ol className="mt-4 flex flex-wrap gap-2">
            {STEPS.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  step === s.id
                    ? 'bg-brand text-brand-foreground'
                    : step > s.id
                      ? 'bg-brand/15 text-brand'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {s.id}. {s.label}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="convert-org-name">Organization name</Label>
                <Input
                  id="convert-org-name"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (!slugTouched) setSlug(slugifyClient(e.target.value));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="convert-slug">Slug</Label>
                <Input
                  id="convert-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugifyClient(e.target.value));
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="convert-tz">Timezone</Label>
                  <select
                    id="convert-tz"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="convert-currency">Currency</Label>
                  <select
                    id="convert-currency"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Choose the starting plan for this organization.</p>
              <div className="grid gap-2">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlan(p.id)}
                    className={cn(
                      'rounded-lg border px-4 py-3 text-left transition-colors',
                      plan === p.id
                        ? 'border-brand bg-brand/5'
                        : 'border-border hover:border-brand/40',
                    )}
                  >
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.blurb}</p>
                  </button>
                ))}
              </div>
              {plan === 'trial' && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="convert-trial-days">Trial duration (days)</Label>
                  <Input
                    id="convert-trial-days"
                    type="number"
                    min={1}
                    max={90}
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value) || 14)}
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="rounded-lg border border-brand/15 bg-brand/5 px-3 py-3 text-sm text-foreground">
                This person will receive an email to create their password and activate the
                organization.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="convert-admin-first">Admin first name</Label>
                  <Input
                    id="convert-admin-first"
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="convert-admin-last">Admin last name</Label>
                  <Input
                    id="convert-admin-last"
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="convert-admin-email">Admin email</Label>
                <Input
                  id="convert-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Review and finish. The organization is created only when you confirm.
              </p>
              <dl className="divide-y divide-border rounded-lg border border-border">
                {[
                  ['Organization', orgName],
                  ['Slug', slug],
                  ['Plan', PLANS.find((p) => p.id === plan)?.name ?? plan],
                  ['Trial', plan === 'trial' ? `${trialDays} days` : '—'],
                  ['Timezone', timezone],
                  ['Currency', currency],
                  ['Admin', `${adminFirstName} ${adminLastName}`],
                  ['Admin email', adminEmail],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            disabled={isPending || step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            Back
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              disabled={
                isPending ||
                (step === 1 && !canStep1) ||
                (step === 2 && !canStep2) ||
                (step === 3 && !canStep3)
              }
              onClick={goNext}
            >
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={isPending} onClick={() => void finish()}>
              {isPending ? 'Creating…' : 'Finish'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
