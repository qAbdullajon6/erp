'use client';

import { cn } from '@/lib/utils';
import type { PasswordStrength } from './hooks';

const TONE_BY_SCORE = [
  'bg-border',
  'bg-destructive',
  'bg-warning',
  'bg-brand',
  'bg-success',
] as const;

const LABEL_TONE_BY_SCORE = [
  'text-muted-foreground',
  'text-destructive',
  'text-warning',
  'text-brand',
  'text-success',
] as const;

/// Purely visual strength estimate (see hooks.ts) — four segments that fill
/// and recolor as the score rises. Hidden entirely for an empty password so
/// it never renders as a bar of "very weak" before the person has typed
/// anything.
export function PasswordStrengthMeter({ strength }: { strength: PasswordStrength }) {
  if (strength.score === 0 && !strength.label) return null;

  return (
    <div className="auth-rise flex items-center gap-2.5" aria-hidden="true">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              segment <= strength.score ? TONE_BY_SCORE[strength.score] : 'bg-border',
            )}
          />
        ))}
      </div>
      <span className={cn('w-20 text-right text-xs font-medium transition-colors duration-300', LABEL_TONE_BY_SCORE[strength.score])}>
        {strength.label}
      </span>
    </div>
  );
}
