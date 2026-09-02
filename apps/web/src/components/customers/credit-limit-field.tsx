'use client';

import { useState, useEffect, useId } from 'react';
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

interface CreditLimitFieldProps {
  /**
   * null  = "Unlimited" — no credit ceiling (stored as NULL).
   * 0     = "No credit" — no credit allowed (stored as 0).
   * NaN   = "Limited" mode, amount not yet entered (validation sentinel).
   * >0    = credit cap (positive finite number).
   * <0    = invalid (rejected by parent validator).
   */
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  className?: string;
}

type CreditMode = 'unlimited' | 'no_credit' | 'limited';

function modeFromValue(v: number | null): CreditMode {
  if (v == null) return 'unlimited';
  if (!Number.isNaN(v) && v === 0) return 'no_credit';
  return 'limited'; // positive, NaN, or negative all stay in limited
}

/**
 * Three-state credit limit selector:
 *
 *   [ Unlimited  ▾ ]   → API/DB: null
 *   [ No credit  ▾ ]   → API/DB: 0
 *   [ Limited    ▾ ]
 *   [ $ 10000    ]     → API/DB: positive number
 *
 * Validation (via parent):
 * - null  → valid (Unlimited)
 * - 0     → valid (No credit)
 * - NaN   → "Enter an amount" (Limited mode, empty input)
 * - <0    → "Amount cannot be negative"
 * - ≥0    → valid
 */
export function CreditLimitField({ value, onChange, error, className }: CreditLimitFieldProps) {
  const [mode, setMode] = useState<CreditMode>(() => modeFromValue(value));
  // draft holds the text shown in the Limited amount input
  const [draft, setDraft] = useState<string>(() =>
    value != null && !Number.isNaN(value) && value > 0 ? String(value) : '',
  );
  const amountId = useId();

  // Sync when parent resets (sheet re-open, customer change)
  useEffect(() => {
    const newMode = modeFromValue(value);
    setMode(newMode);
    // Only update draft when limited mode with a valid positive value
    if (newMode === 'limited' && value != null && Number.isFinite(value) && value > 0) {
      setDraft(String(value));
    }
    // For unlimited/no_credit: preserve draft so switching to Limited later restores it
  }, [value]);

  const handleModeChange = (next: CreditMode) => {
    setMode(next);
    if (next === 'unlimited') {
      onChange(null);
    } else if (next === 'no_credit') {
      onChange(0);
    } else {
      // Limited: restore draft if it has a valid positive value, else signal "required"
      const parsed = parseFloat(draft);
      onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : NaN);
    }
  };

  const handleAmountChange = (raw: string) => {
    setDraft(raw);
    if (raw === '' || raw === '.') {
      onChange(NaN); // sentinel: Limited selected but no amount entered
      return;
    }
    const n = parseFloat(raw);
    if (!Number.isFinite(n) && !Number.isNaN(n)) return; // truly malformed
    onChange(n); // pass through including negatives — parent catches n < 0
  };

  const hasAmountError = mode === 'limited' && !!error;

  return (
    <div className={cn('space-y-2', className)}>
      <Field id="creditLimit" label="Credit limit">
        <Select value={mode} onValueChange={(v) => handleModeChange(v as CreditMode)}>
          <SelectTrigger id="creditLimit" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unlimited">Unlimited</SelectItem>
            <SelectItem value="no_credit">No credit</SelectItem>
            <SelectItem value="limited">Limited</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {mode === 'limited' && (
        <div className="space-y-1">
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
              aria-hidden="true"
            >
              $
            </span>
            <Input
              id={amountId}
              type="number"
              min={0}
              step={0.01}
              value={draft}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              aria-label="Credit limit amount"
              className={cn('h-9 pl-7 font-mono', hasAmountError && 'border-destructive')}
            />
          </div>
          {hasAmountError && (
            <p className="text-[11px] font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
