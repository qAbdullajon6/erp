'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COUNTRIES, COUNTRY_NAME_BY_CODE } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface CountrySelectProps {
  id?: string;
  value: string | null | undefined;
  onChange: (code: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  hasError?: boolean;
}

/// Searchable country combobox. Stores ISO alpha-2 codes (e.g. "UZ"),
/// displays human-readable names, searches by both name and code.
export function CountrySelect({
  id,
  value,
  onChange,
  placeholder = 'Select country…',
  className,
  disabled,
  hasError,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);

  const selectedName = value ? (COUNTRY_NAME_BY_CODE.get(value.toUpperCase()) ?? value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !selectedName && 'text-muted-foreground',
            hasError && 'border-destructive',
            className,
          )}
        >
          <span className="truncate">
            {selectedName ?? placeholder}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear country"
                className="rounded p-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onChange(null);
                  }
                }}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const lc = search.toLowerCase();
            const country = COUNTRIES.find(
              (c) => c.code === itemValue || c.name.toLowerCase() === itemValue,
            );
            if (!country) return 0;
            if (
              country.code.toLowerCase().startsWith(lc) ||
              country.name.toLowerCase().includes(lc)
            ) {
              return 1;
            }
            return 0;
          }}
        >
          <CommandInput placeholder="Search country…" className="h-9" />
          <CommandList
            className="max-h-[260px] overflow-y-auto scrollbar-thin"
            onWheel={(e) => {
              // The browser's native wheel-scroll is blocked by the overflow:hidden
              // on the Command root element. Apply the delta manually since the
              // element scrolls fine programmatically.
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            <CommandEmpty>No country found.</CommandEmpty>
            {/* overflow-visible overrides CommandGroup's default overflow-hidden so the
                browser's scroll routing skips this element and reaches CommandList */}
            <CommandGroup className="overflow-visible">
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={() => {
                    onChange(country.code === value ? null : country.code);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      value?.toUpperCase() === country.code ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{country.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {country.code}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
