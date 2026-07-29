'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useCustomersList } from '@/lib/api/customers';
import { useDriversList } from '@/lib/api/drivers';
import { useVehiclesList } from '@/lib/api/vehicles';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import {
  CALENDAR_STATUS_OPTIONS,
  countActiveFilters,
  presetLabel,
  type CalendarDatePreset,
  type CalendarFilterState,
  type CalendarStatusFilter,
} from './dispatch-calendar-filters';

const ALL = '__all__';

type DriverOption = { id: string; label: string };
type VehicleOption = { id: string; label: string };
type CustomerOption = { id: string; label: string };

interface DispatchCalendarFiltersBarProps {
  filters: CalendarFilterState;
  onChange: (patch: Partial<CalendarFilterState> & { clear?: boolean }) => void;
  onApplyPreset: (preset: CalendarDatePreset) => void;
  openFilter?: 'driver' | 'vehicle' | null;
  onOpenFilterHandled?: () => void;
}

export function DispatchCalendarFiltersBar({
  filters,
  onChange,
  onApplyPreset,
  openFilter,
  onOpenFilterHandled,
}: DispatchCalendarFiltersBarProps) {
  const { items: drivers } = useDriversList({ limit: 100 });
  const { items: vehicles } = useVehiclesList({ limit: 100 });
  const { data: customers } = useCustomersList({ limit: 200 });

  const driverOptions: DriverOption[] = useMemo(
    () =>
      (drivers ?? []).map((d) => ({
        id: d.id,
        label: `${d.firstName} ${d.lastName}`.trim(),
      })),
    [drivers],
  );
  const vehicleOptions: VehicleOption[] = useMemo(
    () =>
      (vehicles ?? []).map((v) => ({
        id: v.id,
        label: v.plateNumber || v.vehicleCode,
      })),
    [vehicles],
  );
  const customerOptions: CustomerOption[] = useMemo(
    () =>
      (customers ?? []).map((c) => ({
        id: c.id,
        label: c.companyName,
      })),
    [customers],
  );

  const [localSearch, setLocalSearch] = useState(filters.q ?? '');
  const debouncedSearch = useDebouncedValue(localSearch, 300);

  useEffect(() => {
    setLocalSearch(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const next = debouncedSearch.trim() || undefined;
    if (next === (filters.q || undefined)) return;
    onChange({ q: next });
    // Only push when the debounced input changes — not when URL filters clear,
    // or a stale query would immediately re-apply after Clear filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce→URL one-way
  }, [debouncedSearch]);

  const activeCount = countActiveFilters(filters);
  const driverLabel = driverOptions.find((d) => d.id === filters.driverId)?.label;
  const vehicleLabel = vehicleOptions.find((v) => v.id === filters.vehicleId)?.label;
  const customerLabel = customerOptions.find((c) => c.id === filters.customerId)?.label;
  const statusLabelText = CALENDAR_STATUS_OPTIONS.find((s) => s.value === filters.status)?.label;

  return (
    <div className="space-y-1.5" data-testid="calendar-filters">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[9rem] flex-1 sm:max-w-[14rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 rounded-full border-white/[0.08] bg-muted/25 pl-8 text-xs shadow-none focus-visible:ring-brand/40"
            aria-label="Search calendar dispatches"
            data-testid="calendar-search"
          />
        </div>

        <FilterPill
          label="Driver"
          value={filters.driverId}
          displayValue={driverLabel}
          allLabel="All Drivers"
          options={driverOptions}
          testId="calendar-filter-driver"
          forceOpen={openFilter === 'driver'}
          onOpenHandled={onOpenFilterHandled}
          onChange={(driverId) => onChange({ driverId })}
        />
        <FilterPill
          label="Vehicle"
          value={filters.vehicleId}
          displayValue={vehicleLabel}
          allLabel="All Vehicles"
          options={vehicleOptions}
          testId="calendar-filter-vehicle"
          forceOpen={openFilter === 'vehicle'}
          onOpenHandled={onOpenFilterHandled}
          onChange={(vehicleId) => onChange({ vehicleId })}
        />
        <FilterPill
          label="Status"
          value={filters.status}
          displayValue={statusLabelText}
          allLabel="All Statuses"
          options={CALENDAR_STATUS_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
          testId="calendar-filter-status"
          onChange={(status) => onChange({ status: status as CalendarStatusFilter | undefined })}
        />
        <FilterPill
          label="Customer"
          value={filters.customerId}
          displayValue={customerLabel}
          allLabel="All Customers"
          options={customerOptions}
          testId="calendar-filter-customer"
          onChange={(customerId) => onChange({ customerId })}
        />

        <DateFilterPill
          preset={filters.preset}
          onApplyPreset={onApplyPreset}
          onClear={() => onChange({ preset: undefined, from: undefined, to: undefined })}
        />

        {filters.preset === 'custom' && (
          <CustomDateRange
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => onChange({ preset: 'custom', from, to })}
          />
        )}

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="calendar-clear-filters"
            onClick={() => {
              setLocalSearch('');
              onChange({ clear: true });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="calendar-filter-chips">
          {filters.q && (
            <FilterChip
              label={`Search: ${filters.q}`}
              onRemove={() => {
                setLocalSearch('');
                onChange({ q: undefined });
              }}
            />
          )}
          {filters.driverId && (
            <FilterChip
              label={`Driver: ${driverLabel ?? 'Selected'}`}
              onRemove={() => onChange({ driverId: undefined })}
            />
          )}
          {filters.vehicleId && (
            <FilterChip
              label={`Vehicle: ${vehicleLabel ?? 'Selected'}`}
              onRemove={() => onChange({ vehicleId: undefined })}
            />
          )}
          {filters.status && (
            <FilterChip
              label={`Status: ${statusLabelText ?? filters.status}`}
              onRemove={() => onChange({ status: undefined })}
            />
          )}
          {filters.customerId && (
            <FilterChip
              label={`Customer: ${customerLabel ?? 'Selected'}`}
              onRemove={() => onChange({ customerId: undefined })}
            />
          )}
          {filters.preset && filters.preset !== 'custom' && (
            <FilterChip
              label={`Date: ${presetLabel(filters.preset)}`}
              onRemove={() => onChange({ preset: undefined, from: undefined, to: undefined })}
            />
          )}
          {filters.preset === 'custom' && (filters.from || filters.to) && (
            <FilterChip
              label={`Date: ${filters.from ?? '…'} → ${filters.to ?? '…'}`}
              onRemove={() => onChange({ preset: undefined, from: undefined, to: undefined })}
            />
          )}
          {filters.kpiFocus && (
            <FilterChip
              label={`Focus: ${filters.kpiFocus}`}
              onRemove={() => onChange({ kpiFocus: undefined, status: undefined })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  value,
  displayValue,
  allLabel,
  options,
  testId,
  forceOpen,
  onOpenHandled,
  onChange,
}: {
  label: string;
  value?: string;
  displayValue?: string;
  allLabel: string;
  options: Array<{ id: string; label: string }>;
  testId: string;
  forceOpen?: boolean;
  onOpenHandled?: () => void;
  onChange: (id: string | undefined) => void;
}) {
  const active = Boolean(value);
  const triggerLabel = active ? (displayValue ?? label) : label;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <Select
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onOpenHandled?.();
      }}
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTrigger
        className={cn(
          'h-8 w-auto max-w-[11rem] gap-1 rounded-full border px-3 text-xs font-medium shadow-none',
          active
            ? 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/15'
            : 'border-white/[0.08] bg-muted/25 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
        aria-label={label}
        data-testid={testId}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DateFilterPill({
  preset,
  onApplyPreset,
  onClear,
}: {
  preset?: CalendarDatePreset;
  onApplyPreset: (preset: CalendarDatePreset) => void;
  onClear: () => void;
}) {
  const active = Boolean(preset);
  const label = preset ? presetLabel(preset) : 'Date';

  return (
    <Select
      value={preset ?? ALL}
      onValueChange={(v) => {
        if (v === ALL) {
          onClear();
          return;
        }
        onApplyPreset(v as CalendarDatePreset);
      }}
    >
      <SelectTrigger
        className={cn(
          'h-8 w-auto gap-1 rounded-full border px-3 text-xs font-medium shadow-none',
          active
            ? 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/15'
            : 'border-white/[0.08] bg-muted/25 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
        aria-label="Date filter"
        data-testid="calendar-filter-date"
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All dates</SelectItem>
        <SelectItem value="today">Today</SelectItem>
        <SelectItem value="tomorrow">Tomorrow</SelectItem>
        <SelectItem value="week">This week</SelectItem>
        <SelectItem value="month">This month</SelectItem>
        <SelectItem value="custom">Custom</SelectItem>
      </SelectContent>
    </Select>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted',
      )}
    >
      <span className="truncate">{label}</span>
      <X className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Remove {label}</span>
    </button>
  );
}

function CustomDateRange({
  from,
  to,
  onChange,
}: {
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}) {
  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
  const toDate = to ? new Date(`${to}T00:00:00`) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs font-normal" data-testid="calendar-custom-from">
            {fromDate ? format(fromDate, 'MMM d') : 'From'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={fromDate}
            onSelect={(d) => onChange(d ? format(d, 'yyyy-MM-dd') : undefined, to)}
          />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs font-normal" data-testid="calendar-custom-to">
            {toDate ? format(toDate, 'MMM d') : 'To'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={toDate}
            onSelect={(d) => onChange(from, d ? format(d, 'yyyy-MM-dd') : undefined)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
