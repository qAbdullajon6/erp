'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

/// Search + filter row shared by every list screen. The native <select> is
/// kept (rather than the Radix Select) because the module tables filter on
/// plain enums and the e2e suite drives them with selectOption().
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
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-brand/10 bg-surface p-4">
      <div className="min-w-[240px] flex-1">
        <label className="text-sm font-medium text-foreground">Search</label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            data-testid={searchTestId}
            className="pl-9"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

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
    <div className="min-w-[170px]">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {children}
      </select>
    </div>
  );
}
