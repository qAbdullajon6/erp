'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/// Shared input treatment for every auth field (text, password, OTP-adjacent).
/// One focus ring, one border, one radius — so Sign In, invitations, and
/// password screens all read as the same product instead of five templates.
export const AUTH_INPUT_CLASSES =
  'h-11 rounded-xl border-border/60 bg-background/40 px-3.5 text-[15px] shadow-none ' +
  'transition-all duration-200 ease-out ' +
  'placeholder:text-muted-foreground/50 ' +
  'hover:border-border ' +
  'focus-visible:border-brand/60 focus-visible:bg-background/70 focus-visible:ring-4 focus-visible:ring-brand/15 ' +
  'aria-[invalid=true]:border-destructive/50 aria-[invalid=true]:focus-visible:ring-destructive/15';

type TextFieldProps = Omit<React.ComponentProps<typeof Input>, 'className'> & {
  label: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  containerClassName?: string;
};

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, id, containerClassName, ...props },
  ref,
) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('grid gap-2', containerClassName)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground/90">
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/70">
            {icon}
          </span>
        )}
        <Input
          id={id}
          ref={ref}
          className={cn(AUTH_INPUT_CLASSES, icon && 'pl-10')}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...props}
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="auth-rise text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
});
