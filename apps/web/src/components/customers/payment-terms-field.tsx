'use client';

import { useEffect, useId, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/customers/customer-form-shared';
import { cn } from '@/lib/utils';
import type { CustomerPaymentTerms } from '@/lib/api/customers';

interface PaymentTermsFieldProps {
  paymentTerms: CustomerPaymentTerms;
  paymentTermsDays: number | null | undefined;
  onPaymentTermsChange: (terms: CustomerPaymentTerms) => void;
  onPaymentTermsDaysChange: (days: number | null) => void;
  /** Error for the paymentTermsDays field (shown when CUSTOM and invalid). */
  daysError?: string;
  className?: string;
}

/** [label, sublabel] pairs for the selector */
const TERM_OPTIONS: [CustomerPaymentTerms, string, string][] = [
  ['DUE_ON_RECEIPT', 'Due on receipt',  'Due immediately'],
  ['NET_7',          'Net 7 days',      'Due in 7 days'],
  ['NET_15',         'Net 15 days',     'Due in 15 days'],
  ['NET_30',         'Net 30 days',     'Due in 30 days'],
  ['NET_45',         'Net 45 days',     'Due in 45 days'],
  ['NET_60',         'Net 60 days',     'Due in 60 days'],
  ['NET_90',         'Net 90 days',     'Due in 90 days'],
  ['CUSTOM',         'Custom',          'Set your own payment period'],
];

/** Return the display label for a given payment terms value. */
export function getPaymentTermsLabel(terms: CustomerPaymentTerms | string | null | undefined): string {
  const found = TERM_OPTIONS.find(([v]) => v === terms);
  return found ? found[1] : (terms ?? '—');
}

/**
 * Payment terms selector + optional custom days input.
 *
 * - Preset terms: just the Select.
 * - CUSTOM: Select + a compact integer input for the number of days.
 * - Switching away from CUSTOM calls onPaymentTermsDaysChange(null) to clear.
 */
export function PaymentTermsField({
  paymentTerms,
  paymentTermsDays,
  onPaymentTermsChange,
  onPaymentTermsDaysChange,
  daysError,
  className,
}: PaymentTermsFieldProps) {
  const daysId = useId();

  // Local state mirrors the props so the trigger updates immediately on click,
  // independent of how quickly the parent React update cycle completes.
  // Without this, purely-controlled Selects can lag in Playwright because
  // pointer events in Radix portals don't block on the parent re-render.
  const [localTerms, setLocalTerms] = useState<CustomerPaymentTerms>(paymentTerms);
  const [draft, setDraft] = useState<string>(() =>
    paymentTermsDays != null && !Number.isNaN(paymentTermsDays) ? String(paymentTermsDays) : '',
  );

  // Sync from parent when sheet re-opens or customer changes
  useEffect(() => {
    setLocalTerms(paymentTerms);
  }, [paymentTerms]);
  useEffect(() => {
    setDraft(
      paymentTermsDays != null && !Number.isNaN(paymentTermsDays) ? String(paymentTermsDays) : '',
    );
  }, [paymentTermsDays]);

  const handleTermsChange = (next: CustomerPaymentTerms) => {
    setLocalTerms(next);     // immediate local update — trigger reflects selection right away
    onPaymentTermsChange(next);
    if (next !== 'CUSTOM') {
      setDraft('');
      onPaymentTermsDaysChange(null);
    } else {
      const parsed = parseInt(draft, 10);
      onPaymentTermsDaysChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN);
    }
  };

  const handleDaysChange = (raw: string) => {
    setDraft(raw);
    if (raw === '') {
      onPaymentTermsDaysChange(NaN);
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    onPaymentTermsDaysChange(n);
  };

  const isCustom = localTerms === 'CUSTOM';

  return (
    <div className={cn('space-y-2', className)}>
      <Field id="paymentTerms" label="Payment terms">
        <Select value={localTerms} onValueChange={(v) => handleTermsChange(v as CustomerPaymentTerms)}>
          <SelectTrigger id="paymentTerms" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERM_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {isCustom && (
        <div className="space-y-1">
          <label
            htmlFor={daysId}
            className="text-xs font-medium text-muted-foreground"
          >
            Payment period (days)
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={daysId}
              type="number"
              min={0}
              step={1}
              value={draft}
              onChange={(e) => handleDaysChange(e.target.value)}
              placeholder="e.g. 20"
              aria-label="Custom payment period in days"
              className={cn('h-9 w-32 font-mono', daysError && 'border-destructive')}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          {daysError && (
            <p className="text-[11px] font-medium text-destructive" role="alert">
              {daysError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
