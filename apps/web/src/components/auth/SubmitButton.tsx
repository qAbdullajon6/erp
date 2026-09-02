'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { cn } from '@/lib/utils';

/// The one CTA style every auth form submits with. Swaps in a spinner next to
/// the label (rather than replacing it) so the button never changes width
/// mid-submit, and disables itself while pending.
///
/// It also stays disabled until the page has hydrated. A form's default submit
/// button being disabled is what blocks *implicit* submission — pressing Enter
/// in a field — so this is what stops an early Enter from performing a native
/// GET that would carry the typed password in the query string. See
/// `useHydrated`.
export function SubmitButton({
  loading = false,
  loadingLabel,
  children,
  className,
  disabled,
  ...props
}: ButtonProps & { loading?: boolean; loadingLabel?: React.ReactNode }) {
  const hydrated = useHydrated();
  const pending = loading || !hydrated;

  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      // Nothing is happening yet before hydration, so don't imply it is.
      aria-busy={loading || undefined}
      className={cn(
        // Solid brand rather than the old gradient: it's the same button the
        // landing page's primary CTA uses, and a flat fill reads calmer next
        // to two quiet input fields than a two-stop gradient does.
        'h-11 w-full gap-2 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground',
        'transition-colors duration-150 hover:bg-brand/90',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? (loadingLabel ?? children) : children}
    </Button>
  );
}
