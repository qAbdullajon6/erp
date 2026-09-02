'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, MapPin, X, Loader2 } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useAddressSuggestions, type PlaceSuggestion } from '@/lib/api/geocoding';
import { cn } from '@/lib/utils';

interface AddressSearchProps {
  id?: string;
  countryCode: string | null | undefined;
  /** Currently selected suggestion (controlled). null means nothing is selected. */
  value: PlaceSuggestion | null;
  onChange: (suggestion: PlaceSuggestion | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  hasError?: boolean;
}

/**
 * Street-address typeahead backed by LocationIQ via /api/geocoding/suggest.
 * Renders a Popover+Command combobox like CitySelect, with richer per-suggestion
 * detail (city, postal code). Selecting an address populates the parent form's
 * address, postalCode, and coordinate fields without a separate map step.
 */
export function AddressSearch({
  id,
  countryCode,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  hasError,
}: AddressSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // When a suggestion is already selected, show its name in the trigger.
  const triggerLabel = value?.name ?? null;

  // Reset query when popover closes
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Clear selection when country changes (address no longer valid)
  const prevCountry = useRef(countryCode);
  useEffect(() => {
    if (prevCountry.current !== countryCode) {
      prevCountry.current = countryCode;
      onChange(null);
    }
  }, [countryCode, onChange]);

  const { suggestions, loading } = useAddressSuggestions(query, countryCode);

  const effectivePlaceholder = placeholder ?? 'Search street address…';

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
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{triggerLabel ?? effectivePlaceholder}</span>
          </span>
          {triggerLabel && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear address"
              className="ml-2 shrink-0 rounded p-0.5 hover:bg-muted"
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
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={() => 1}>
          <div className="flex items-center border-b px-3">
            <CommandInput
              ref={inputRef}
              placeholder="Type a street or address…"
              value={query}
              onValueChange={setQuery}
              className="h-9"
            />
            {loading && (
              <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          <CommandList
            className="max-h-[300px] overflow-y-auto scrollbar-thin"
            onWheel={(e) => {
              // Bypass Command root's overflow:hidden scroll trap (same fix as CitySelect).
              e.currentTarget.scrollTop += e.deltaY;
            }}
          >
            {query.trim().length < 2 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Type at least 2 characters to search
              </div>
            ) : loading && suggestions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Searching…</div>
            ) : (
              <>
                <CommandEmpty>No addresses found for &ldquo;{query}&rdquo;</CommandEmpty>
                <CommandGroup className="overflow-visible">
                  {suggestions.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      onSelect={() => {
                        onChange(s);
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          value?.id === s.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <AddressMeta suggestion={s} />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddressMeta({ suggestion }: { suggestion: PlaceSuggestion }) {
  const parts: string[] = [];
  if (suggestion.city) parts.push(suggestion.city);
  if (suggestion.postalCode) parts.push(suggestion.postalCode);
  if (suggestion.region && suggestion.region !== suggestion.city) parts.push(suggestion.region);

  if (!parts.length) return null;
  return (
    <span className="block truncate text-[11px] text-muted-foreground">{parts.join(' · ')}</span>
  );
}
