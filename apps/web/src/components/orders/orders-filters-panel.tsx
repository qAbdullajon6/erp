'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useMembersQuery } from '@/lib/api/organizations';
import type { OrderPaymentStatus, OrderStatus } from '@/lib/api/orders';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, Filter, RotateCcw, X } from 'lucide-react';

export type OrdersFilterValues = {
  status?: OrderStatus;
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  dispatcherId?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  createdFrom?: string;
  createdTo?: string;
  priceMin?: number;
  priceMax?: number;
  paymentStatus?: OrderPaymentStatus;
  archivedOnly?: boolean;
};

const ORDER_STATUSES: OrderStatus[] = [
  'DRAFT',
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

const PAYMENT_STATUSES: OrderPaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'NO_INVOICE'];

function countActiveFilters(values: OrdersFilterValues): number {
  let n = 0;
  if (values.status) n++;
  if (values.customerId) n++;
  if (values.driverId) n++;
  if (values.vehicleId) n++;
  if (values.dispatcherId) n++;
  if (values.pickupDateFrom || values.pickupDateTo) n++;
  if (values.deliveryDateFrom || values.deliveryDateTo) n++;
  if (values.createdFrom || values.createdTo) n++;
  if (values.priceMin !== undefined || values.priceMax !== undefined) n++;
  if (values.paymentStatus) n++;
  if (values.archivedOnly) n++;
  return n;
}

function DateRangeField({
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  label: string;
  from?: string;
  to?: string;
  onFromChange: (v?: string) => void;
  onToChange: (v?: string) => void;
}) {
  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
  const toDate = to ? new Date(`${to}T00:00:00`) : undefined;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 justify-start text-xs font-normal">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {fromDate ? format(fromDate, 'MMM d, yyyy') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={(d) => onFromChange(d ? format(d, 'yyyy-MM-dd') : undefined)}
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 justify-start text-xs font-normal">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {toDate ? format(toDate, 'MMM d, yyyy') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={toDate}
              onSelect={(d) => onToChange(d ? format(d, 'yyyy-MM-dd') : undefined)}
            />
          </PopoverContent>
        </Popover>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              onFromChange(undefined);
              onToChange(undefined);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface OrdersFiltersPanelProps {
  values: OrdersFilterValues;
  onChange: (values: OrdersFilterValues) => void;
  onClear: () => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

export function OrdersFiltersPanel({
  values,
  onChange,
  onClear,
  expanded = false,
  onToggleExpanded,
}: OrdersFiltersPanelProps) {
  const { data: customers } = useCustomersList({ limit: 200, includeArchived: true });
  const { items: drivers } = useDriversList({ limit: 100 });
  const { items: vehicles } = useVehiclesList({ limit: 100 });
  const { data: members } = useMembersQuery();

  const activeCount = useMemo(() => countActiveFilters(values), [values]);
  const dispatchers = useMemo(
    () =>
      (members ?? []).filter((m) =>
        ['ADMIN', 'OPERATIONS_MANAGER', 'DISPATCHER'].includes(m.role),
      ),
    [members],
  );

  const set = (patch: Partial<OrdersFilterValues>) => onChange({ ...values, ...patch });

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex flex-wrap items-center gap-2 px-1 py-2">
        <Button
          type="button"
          variant={expanded ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 gap-1.5"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">
              {activeCount}
            </span>
          )}
        </Button>

        {values.archivedOnly && (
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
            Archived only
          </span>
        )}

        {activeCount > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={onClear}>
            <RotateCcw className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-3 border-t border-border/70 px-1 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={values.status ?? 'all'}
              onValueChange={(v) => set({ status: v === 'all' ? undefined : (v as OrderStatus) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <Select
              value={values.customerId ?? 'all'}
              onValueChange={(v) => set({ customerId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Driver</Label>
            <Select
              value={values.driverId ?? 'all'}
              onValueChange={(v) => set({ driverId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any driver</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.firstName} {d.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Vehicle</Label>
            <Select
              value={values.vehicleId ?? 'all'}
              onValueChange={(v) => set({ vehicleId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any vehicle</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plateNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Dispatcher</Label>
            <Select
              value={values.dispatcherId ?? 'all'}
              onValueChange={(v) => set({ dispatcherId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any dispatcher" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any dispatcher</SelectItem>
                {dispatchers.map((m) => (
                  <SelectItem key={m.user.id} value={m.user.id}>
                    {m.user.firstName} {m.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DateRangeField
            label="Pickup date"
            from={values.pickupDateFrom}
            to={values.pickupDateTo}
            onFromChange={(pickupDateFrom) => set({ pickupDateFrom })}
            onToChange={(pickupDateTo) => set({ pickupDateTo })}
          />

          <DateRangeField
            label="Delivery date"
            from={values.deliveryDateFrom}
            to={values.deliveryDateTo}
            onFromChange={(deliveryDateFrom) => set({ deliveryDateFrom })}
            onToChange={(deliveryDateTo) => set({ deliveryDateTo })}
          />

          <DateRangeField
            label="Created date"
            from={values.createdFrom}
            to={values.createdTo}
            onFromChange={(createdFrom) => set({ createdFrom })}
            onToChange={(createdTo) => set({ createdTo })}
          />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Value range</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Min"
                className="h-8 text-xs"
                value={values.priceMin ?? ''}
                onChange={(e) =>
                  set({
                    priceMin: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
              <Input
                type="number"
                min={0}
                placeholder="Max"
                className="h-8 text-xs"
                value={values.priceMax ?? ''}
                onChange={(e) =>
                  set({
                    priceMax: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment status</Label>
            <Select
              value={values.paymentStatus ?? 'all'}
              onValueChange={(v) =>
                set({ paymentStatus: v === 'all' ? undefined : (v as OrderPaymentStatus) })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                {PAYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 pb-0.5">
            <div
              className={cn(
                'flex w-full items-center justify-between rounded-lg border border-border px-3 py-2',
                values.archivedOnly && 'border-brand/40 bg-brand/5',
              )}
            >
              <Label htmlFor="archived-only" className="text-xs font-medium">
                Archived only
              </Label>
              <Switch
                id="archived-only"
                checked={Boolean(values.archivedOnly)}
                onCheckedChange={(archivedOnly) => set({ archivedOnly: archivedOnly || undefined })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const ORDERS_SAVED_FILTERS_KEY = 'flowerp.orders.saved-filters';
export const ORDERS_COLUMNS_KEY = 'flowerp.orders.visible-columns';

export type OrdersListColumn =
  | 'route'
  | 'timeline'
  | 'customer'
  | 'value'
  | 'status'
  | 'orderNumber'
  | 'pickupDate'
  | 'deliveryDate';

export const DEFAULT_ORDERS_COLUMNS: OrdersListColumn[] = [
  'route',
  'timeline',
  'customer',
  'value',
  'status',
];

export function loadVisibleColumns(): OrdersListColumn[] {
  if (typeof window === 'undefined') return DEFAULT_ORDERS_COLUMNS;
  try {
    const raw = localStorage.getItem(ORDERS_COLUMNS_KEY);
    if (!raw) return DEFAULT_ORDERS_COLUMNS;
    const parsed = JSON.parse(raw) as OrdersListColumn[];
    return parsed.length > 0 ? parsed : DEFAULT_ORDERS_COLUMNS;
  } catch {
    return DEFAULT_ORDERS_COLUMNS;
  }
}

export function saveVisibleColumns(columns: OrdersListColumn[]) {
  localStorage.setItem(ORDERS_COLUMNS_KEY, JSON.stringify(columns));
}

export type SavedOrdersFilter = { name: string; values: OrdersFilterValues };

export function loadSavedFilters(): SavedOrdersFilter[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ORDERS_SAVED_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as SavedOrdersFilter[]) : [];
  } catch {
    return [];
  }
}

export function persistSavedFilters(filters: SavedOrdersFilter[]) {
  localStorage.setItem(ORDERS_SAVED_FILTERS_KEY, JSON.stringify(filters));
}
