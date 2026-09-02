'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePlaceSuggestions } from '@/lib/api/geocoding';
import { cn } from '@/lib/utils';

export interface CityCoords {
  lat: number;
  lng: number;
}

interface CitySelectProps {
  id?: string;
  countryCode: string | null | undefined;
  value: string | null | undefined;
  onChange: (city: string | null, coords: CityCoords | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  hasError?: boolean;
}

/// Searchable city combobox backed by the Mapbox Geocoding API.
/// - Requires a country code — disabled with "Select country first" when absent.
/// - Debounces the query 300ms before calling /api/geocoding/suggest.
/// - Gracefully degrades to a plain text input when Mapbox is not configured.
/// - Stores the plain city name string (same as Customer.city field).
/// - Applying the same wheel-scroll fix used in CountrySelect.
export function CitySelect({
  id,
  countryCode,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  hasError,
}: CitySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasCountry = Boolean(countryCode?.trim());
  const isDisabled = disabled || !hasCountry;

  // Reset query when the dropdown closes or country changes
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  useEffect(() => {
    setQuery('');
  }, [countryCode]);

  const { suggestions, loading, configured: mapboxConfigured } = usePlaceSuggestions(query, countryCode);

  // ── Graceful fallback: free-text input when Mapbox is unconfigured ──────
  // Coords are not available — pass null so callers clear any stale coordinates.
  if (!mapboxConfigured) {
    return (
      <Input
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null, null)}
        disabled={isDisabled}
        placeholder={!hasCountry ? 'Select country first' : (placeholder ?? 'Enter city')}
        className={cn('h-9', hasError && 'border-destructive', className)}
        maxLength={100}
      />
    );
  }

  const effectivePlaceholder = !hasCountry ? 'Select country first' : (placeholder ?? 'Select city…');

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!isDisabled) setOpen(next);
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
          disabled={isDisabled}
          className={cn(
            'h-9 w-full justify-between font-normal',
            (!value || !hasCountry) && 'text-muted-foreground',
            hasError && 'border-destructive',
            className,
          )}
        >
          <span className="truncate">{value && hasCountry ? value : effectivePlaceholder}</span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {value && hasCountry && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear city"
                className="rounded p-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null, null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onChange(null, null);
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
          // Bypass cmdk's built-in filter — results come from the API already filtered
          filter={() => 1}
        >
          <div className="flex items-center border-b px-3">
            <CommandInput
              ref={inputRef}
              placeholder="Type a city name…"
              value={query}
              onValueChange={setQuery}
              className="h-9"
            />
            {loading && <Loader2 className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <CommandList
            className="max-h-[260px] overflow-y-auto scrollbar-thin"
            onWheel={(e) => {
              // Same fix as CountrySelect: Command root's overflow:hidden suppresses
              // the browser's native wheel scroll; apply the delta directly.
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
                <CommandEmpty>No cities found for "{query}"</CommandEmpty>
                {/* overflow-visible removes CommandGroup's scroll-blocking overflow:hidden */}
                <CommandGroup className="overflow-visible">
                  {suggestions.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      onSelect={() => {
                        onChange(s.name, { lat: s.lat, lng: s.lng });
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          value === s.name ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{s.name}</span>
                        {s.region && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {s.region}
                          </span>
                        )}
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
