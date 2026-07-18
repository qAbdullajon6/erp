'use client';

import { AlertCircle } from 'lucide-react';

/// The inline form error the authentication pages render (see auth.sign-in).
/// Extracted so every form surfaces failures identically instead of each one
/// re-copying the markup — and so the icon is consistently decorative and the
/// message is consistently announced.
export function FormAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
