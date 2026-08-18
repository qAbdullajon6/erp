'use client';

import type { ReactNode } from 'react';
import { SearchInput } from '@/components/shared/search-input';

/// Search + filter row shared by every list screen. The native <select> is
/// kept (rather than the Radix Select) because the module tables filter on
/// plain enums and the e2e suite drives them with selectOption().
///
/// This used to render as a bordered card with a "Search" label stacked above
/// the field, while Customers, Drivers, Vehicles and the fleet screens used a
/// bare inline field with the icon inside it. Finance and Customers are one
/// click apart in the sidebar and looked like they came from different
/// products. The inline form won — it is what most screens already used, it
/// costs a row less vertical space, and a magnifier inside a box that says
/// "Search…" does not need a label above it saying "Search".
///
/// The props are unchanged so all eight callers, and the e2e selectors that
/// drive them, keep working.
export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchTestId,
  children,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchTestId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        className="min-w-[16rem] flex-1"
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        label="Search"
        testId={searchTestId}
      />
      {children}
    </div>
  );
}

/// A filter dropdown that sits inline beside the search field.
///
/// Stays a native `<select>` on purpose — the e2e suite drives these with
/// `selectOption()`, and on a phone the platform picker beats any menu we could
/// build. The label moved into the control as a prefix so the row lines up on
/// one baseline instead of every filter being a two-line stack.
export function FilterSelect({
  label,
  value,
  onChange,
  testId,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex h-9 min-w-[10rem] items-center gap-1.5 rounded-md border border-input bg-background pl-3 pr-1 text-sm shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="h-full min-w-0 flex-1 bg-transparent pr-1 text-sm text-foreground outline-none"
      >
        {children}
      </select>
    </label>
  );
}
