'use client';

import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/// The search box, once.
///
/// There were eleven of these, and five were raw `<input>` elements that
/// reimplemented the `Input` primitive's styling by hand. That is not just
/// duplication: those five had frozen at `focus-visible:ring-1`, so when the
/// shared focus ring was strengthened to a 2px ring plus a coloured border,
/// the search field on Customers, Drivers, Vehicles, Devices and the fleet map
/// silently kept the old, hard-to-see one. Whether your focus ring is visible
/// should not depend on which screen you are on.
///
/// `sm` is for the dense bars on operations workspaces, where the field sits in
/// a row of 32px controls; `md` is the default for list screens.
export const SearchInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /// Screen-reader name. Required because these fields are icon-only — there
    /// is no visible label to associate.
    label: string;
    size?: 'sm' | 'md';
    className?: string;
    testId?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  }
>(function SearchInput(
  { value, onChange, placeholder, label, size = 'md', className, testId, onKeyDown },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          size === 'sm' ? 'left-2.5 h-3.5 w-3.5' : 'left-3 h-4 w-4',
        )}
        aria-hidden
      />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label}
        data-testid={testId}
        className={cn(
          // `type="search"` for the mobile keyboard's Search key and the
          // correct role, but Chrome then draws its own clear button that
          // Firefox and Safari do not, so the same field would have different
          // affordances per browser. Ours is the one we control.
          '[&::-webkit-search-cancel-button]:appearance-none',
          size === 'sm' ? 'h-8 pl-8 text-sm' : 'h-9 pl-9',
        )}
      />
    </div>
  );
});
