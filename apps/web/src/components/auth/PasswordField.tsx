'use client';

import * as React from 'react';
import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AUTH_INPUT_CLASSES } from './TextField';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { useCapsLockWarning, usePasswordStrength } from './hooks';

type PasswordFieldProps = Omit<React.ComponentProps<typeof Input>, 'className' | 'type'> & {
  label: string;
  hint?: string;
  error?: string;
  showStrength?: boolean;
  labelExtra?: React.ReactNode;
};

export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { label, hint, error, showStrength = false, labelExtra, id, value, onKeyDown, onKeyUp, onBlur, ...props },
    ref,
  ) {
    const [visible, setVisible] = React.useState(false);
    const { capsLockOn, onKeyEvent, onBlur: clearCapsLock } = useCapsLockWarning();
    const strength = usePasswordStrength(typeof value === 'string' ? value : '');

    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const capsId = `${id}-capslock`;

    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id} className="text-[13px] font-medium text-foreground/90">
            {label}
          </Label>
          {labelExtra}
        </div>

        <div className="relative">
          <Input
            id={id}
            ref={ref}
            type={visible ? 'text' : 'password'}
            value={value}
            className={cn(AUTH_INPUT_CLASSES, 'pr-11')}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, errorId, capsLockOn ? capsId : undefined].filter(Boolean).join(' ') || undefined}
            onKeyDown={(e) => {
              onKeyEvent(e);
              onKeyDown?.(e);
            }}
            onKeyUp={(e) => {
              onKeyEvent(e);
              onKeyUp?.(e);
            }}
            onBlur={(e) => {
              clearCapsLock();
              onBlur?.(e);
            }}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="group absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={visible ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            <span className="relative block h-4 w-4">
              <Eye
                className={cn(
                  'absolute inset-0 h-4 w-4 transition-all duration-200 ease-out',
                  visible ? 'scale-75 opacity-0 blur-[1px]' : 'scale-100 opacity-100 blur-0',
                )}
              />
              <EyeOff
                className={cn(
                  'absolute inset-0 h-4 w-4 transition-all duration-200 ease-out',
                  visible ? 'scale-100 opacity-100 blur-0' : 'scale-75 opacity-0 blur-[1px]',
                )}
              />
            </span>
          </button>
        </div>

        {capsLockOn && (
          <p
            id={capsId}
            role="status"
            className="auth-rise flex items-center gap-1.5 text-xs font-medium text-warning"
          >
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Caps Lock is on
          </p>
        )}

        {showStrength && <PasswordStrengthMeter strength={strength} />}

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
  },
);
