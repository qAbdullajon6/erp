'use client';

import { useCallback, useMemo, useState } from 'react';

/// Watches keydown/keyup on whatever field it's attached to and reports
/// whether Caps Lock is currently on. Pure client-side UX signal — nothing
/// here reads or validates the password itself.
export function useCapsLockWarning() {
  const [capsLockOn, setCapsLockOn] = useState(false);

  const onKeyEvent = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }, []);

  const onBlur = useCallback(() => setCapsLockOn(false), []);

  return { capsLockOn, onKeyEvent, onBlur };
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

/// Cosmetic, client-only strength estimate — length + character variety.
/// This is a UX affordance to help someone pick a stronger password, not a
/// policy: the backend remains the source of truth for what's accepted.
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  return { score: clamped, label: labels[clamped] };
}

export function usePasswordStrength(password: string): PasswordStrength {
  return useMemo(() => getPasswordStrength(password), [password]);
}
