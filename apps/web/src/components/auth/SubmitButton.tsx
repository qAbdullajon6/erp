'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/// The one CTA style every auth form submits with. Swaps in a spinner next to
/// the label (rather than replacing it) so the button never changes width
/// mid-submit, and disables itself while pending.
export function SubmitButton({
  loading = false,
  loadingLabel,
  children,
  className,
  disabled,
  ...props
}: ButtonProps & { loading?: boolean; loadingLabel?: React.ReactNode }) {
  return (
    <Button
      type="submit"
      disabled={disabled || loading}
      className={cn(
        'h-11 w-full gap-2 rounded-xl bg-gradient-brand text-[15px] font-semibold text-brand-foreground',
        'transition-all duration-200 hover:opacity-90 hover:shadow-brand active:scale-[0.99]',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? (loadingLabel ?? children) : children}
    </Button>
  );
}
