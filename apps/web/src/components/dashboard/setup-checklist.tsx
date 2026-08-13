import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SurfaceCard } from '@/components/ui/surface-card';
import {
  useOnboardingProgressQuery,
  useSkipOnboardingMutation,
  type OnboardingSteps,
} from '@/lib/api/onboarding';
import { cn } from '@/lib/utils';

/// The first thing a new company saw was the full operations dashboard reading
/// zero across every panel, with nothing to say which of the eleven sidebar
/// entries to open first. The backend already knew the answer — five setup
/// steps — but nothing had ever rendered them.
///
/// Only shown while setup is genuinely unfinished and the admin hasn't
/// dismissed it, so an established workspace never sees it again.

interface Step {
  key: keyof OnboardingSteps;
  label: string;
  description: string;
  to: string;
  search?: Record<string, unknown>;
}

const STEPS: Step[] = [
  {
    key: 'organizationProfile',
    label: 'Add your company details',
    description: 'Legal name, tax ID and address — these are printed on every invoice.',
    to: '/app/settings',
    search: { tab: 'company' },
  },
  {
    key: 'firstCustomer',
    label: 'Add your first customer',
    description: 'Who you deliver for. Orders and invoices are raised against a customer.',
    to: '/app/customers',
  },
  {
    key: 'firstVehicle',
    label: 'Add a vehicle',
    description: 'Your fleet. Vehicles are assigned to dispatches and can carry a GPS device.',
    to: '/app/vehicles',
  },
  {
    key: 'firstDriver',
    label: 'Add a driver',
    description: 'Drivers get their own app view with the jobs assigned to them.',
    to: '/app/drivers',
  },
  {
    key: 'firstOrder',
    label: 'Create your first order',
    description: 'A job to move cargo. Dispatch it to a driver and vehicle to start tracking.',
    to: '/app/orders',
    search: { create: true },
  },
];

export function SetupChecklist({ canDismiss }: { canDismiss: boolean }) {
  const { data } = useOnboardingProgressQuery();
  const skip = useSkipOnboardingMutation();

  if (!data || data.completed || data.skipped) return null;

  const done = STEPS.filter((s) => data.steps[s.key]).length;
  const next = STEPS.find((s) => !data.steps[s.key]);

  return (
    <SurfaceCard className="p-4 sm:p-5" data-testid="setup-checklist">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Finish setting up FlowERP</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {done === 0
              ? "Five steps to your first tracked delivery."
              : `${done} of ${STEPS.length} done — next up: ${next?.label.toLowerCase()}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {done}/{STEPS.length}
          </span>
          {canDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => skip.mutate()}
              disabled={skip.isPending}
              aria-label="Dismiss setup checklist"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={STEPS.length}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${(done / STEPS.length) * 100}%` }}
        />
      </div>

      <ol className="mt-4 space-y-1">
        {STEPS.map((step) => {
          const complete = data.steps[step.key];
          return (
            <li key={step.key}>
              <Link
                to={step.to}
                search={step.search as never}
                className={cn(
                  'group flex items-start gap-3 rounded-md px-2 py-2 transition-colors',
                  'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    complete
                      ? 'border-success bg-success text-success-foreground'
                      : 'border-border text-transparent',
                  )}
                  aria-hidden
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-xs font-medium',
                      complete ? 'text-muted-foreground line-through' : 'text-foreground',
                    )}
                  >
                    {step.label}
                    <span className="sr-only">{complete ? ' (done)' : ''}</span>
                  </span>
                  {!complete && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {step.description}
                    </span>
                  )}
                </span>
                {!complete && (
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </SurfaceCard>
  );
}
