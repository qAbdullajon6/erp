'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/// Auth fields are the only inputs a person meets before they are a user, so
/// they get a taller touch target and a little more breathing room than the
/// dense in-app default. Focus and invalid states come from the shared `Input`
/// primitive — this only adjusts size and surface, so the two can't drift.
export const AUTH_INPUT_CLASSES =
  'h-11 rounded-lg border-border/70 bg-background/40 px-3.5 text-[15px] shadow-none ' +
  'transition-colors duration-150 ' +
  'placeholder:text-muted-foreground/60 ' +
  'hover:border-border';

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
