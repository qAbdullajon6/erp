'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE_STYLES = {
  brand: 'bg-brand/10 text-brand ring-brand/15',
  success: 'bg-success/10 text-success ring-success/15',
  destructive: 'bg-destructive/10 text-destructive ring-destructive/15',
  warning: 'bg-warning/10 text-warning ring-warning/15',
  muted: 'bg-muted text-muted-foreground ring-border',
} as const;

type Tone = keyof typeof TONE_STYLES;

/// One shared "here's the state of the world" panel for every auth screen
/// that isn't a form: invitation loading/error, reset-password success/
/// expired/invalid, email-verification verifying/failed. Icon + headline +
/// copy + optional action, in one of five restrained tones — so a locked-out
/// user sees the same visual language everywhere, not five bespoke layouts.
export function AuthStatusCard({
  icon: Icon,
  tone = 'brand',
  spin = false,
  title,
  description,
  action,
  secondary,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  spin?: boolean;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('auth-rise flex flex-col items-center gap-5 py-2 text-center', className)}>
      <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset', TONE_STYLES[tone])}>
        {spin ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="h-6 w-6" aria-hidden="true" />
        )}
      </span>

      <div className="space-y-1.5">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>

      {action && <div className="w-full pt-1">{action}</div>}
      {secondary && <div className="text-sm text-muted-foreground">{secondary}</div>}
    </div>
  );
}
