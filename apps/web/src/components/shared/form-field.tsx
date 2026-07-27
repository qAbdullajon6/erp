'use client';

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/// Label + control + inline error, so every form reports validation the same
/// way instead of each screen inventing its own red text.
export function FormField({
  id,
  label,
  required = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // The visible <p> announces the error visually; screen reader users need
  // the same text tied to the field itself via aria-invalid/-describedby,
  // which a plain sibling <p> doesn't do on its own.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-invalid'?: boolean; 'aria-describedby'?: string }>, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': errorId ?? hintId,
      })
    : children;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <>
            <span className="ml-0.5 text-destructive" aria-hidden>
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </Label>
      {control}
      {hint && !error ? <p id={hintId} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={errorId} className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}
