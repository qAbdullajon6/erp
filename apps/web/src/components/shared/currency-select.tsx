'use client';

import { useEffect, useRef, useState } from 'react';
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
import { CURRENCIES } from '@/lib/currencies';
import { cn } from '@/lib/utils';

interface CurrencySelectProps {
  id?: string;
  /** ISO 4217 three-letter code, or null/empty for "org default". */
  value: string | null | undefined;
  onChange: (code: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  hasError?: boolean;
}

/**
 * Searchable currency combobox backed by the ISO 4217 dataset.
 * Matches by code ("USD") or name ("US Dollar").
 * Empty/null value means "use organisation default".
 */
export function CurrencySelect({
  id,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  hasError,
}: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Find the selected currency for display
  const selectedCurrency = value ? CURRENCIES.find((c) => c.code === value) : null;
  const triggerLabel = selectedCurrency
    ? `${selectedCurrency.code} — ${selectedCurrency.name}`
    : null;

  const effectivePlaceholder = placeholder ?? 'Org default';

  // Filter currencies by code prefix or name substring (case-insensitive)
  const filtered = query.trim().length === 0
    ? CURRENCIES
    : CURRENCIES.filter((c) =>
        c.code.toLowerCase().startsWith(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase()),
      );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
        if (next) requestAnimationFrame(() => inputRef.current?.focus());
      }}
    >
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
            !triggerLabel && 'text-muted-foreground',
            hasError && 'border-destructive',
            className,
          )}
        >
          <span className="truncate">{triggerLabel ?? effectivePlaceholder}</span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {triggerLabel && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear currency"
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

      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={() => 1}>
          <div className="flex items-center border-b px-3">
            <CommandInput
              ref={inputRef}
              placeholder="Search by code or name…"
              value={query}
              onValueChange={setQuery}
              className="h-9"
            />
          </div>
          <CommandList
            className="max-h-[260px] overflow-y-auto scrollbar-thin"
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            <CommandEmpty>No currencies found for &ldquo;{query}&rdquo;</CommandEmpty>
            <CommandGroup className="overflow-visible">
              {filtered.map((c) => (
                <CommandItem
                  key={c.code}
                  value={c.code}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      value === c.code ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="font-mono text-sm font-medium">{c.code}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
