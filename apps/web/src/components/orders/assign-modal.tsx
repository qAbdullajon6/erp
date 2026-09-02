'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAvailability, type AvailableDriver, type AvailableVehicle } from '@/lib/api/availability';
import { useAssignOrder, type Order } from '@/lib/api/orders';
import { hasEffectiveAssignment } from '@/components/orders/order-assignment.util';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { ArrowRight, Check, Search, Truck, User, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

export type AssignTab = 'both' | 'driver' | 'vehicle';

interface AssignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  order: Order;
  dispatch: ApiDispatch | null;
  initialTab?: AssignTab;
  preselectedDriverId?: string | null;
  preselectedVehicleId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function driverStatusMeta(status: string): { label: string; dot: string; dim: boolean } {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return { label: 'Available', dot: 'bg-emerald-500', dim: false };
    case 'ON_LEAVE':
      return { label: 'On leave', dot: 'bg-amber-500', dim: false };
    default:
      return { label: 'Inactive', dot: 'bg-muted-foreground', dim: true };
  }
}

function vehicleStatusMeta(status: string): { label: string; dot: string; dim: boolean } {
  switch (status.toUpperCase()) {
    case 'AVAILABLE':
      return { label: 'Available', dot: 'bg-emerald-500', dim: false };
    case 'IN_USE':
      return { label: 'In use', dot: 'bg-amber-500', dim: false };
    case 'MAINTENANCE':
      return { label: 'Maintenance', dot: 'bg-rose-500', dim: true };
    default:
      return { label: 'Inactive', dot: 'bg-muted-foreground', dim: true };
  }
}

// ─── Driver row ───────────────────────────────────────────────────────────────

function DriverRow({
  driver,
  selected,
  onSelect,
}: {
  driver: AvailableDriver;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = driverStatusMeta(driver.status);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-brand/60 bg-brand/[0.06]'
          : 'border-border/60 bg-background/30 hover:border-border hover:bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* radio */}
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-brand bg-brand' : 'border-border/70 bg-background',
          )}
        >
          {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </span>

        {/* avatar */}
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            selected ? 'bg-brand/15 text-brand' : meta.dim ? 'bg-muted text-muted-foreground' : 'bg-brand/10 text-brand',
          )}
        >
          {initials(driver.firstName, driver.lastName)}
        </span>

        {/* info */}
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold leading-tight', meta.dim ? 'text-muted-foreground' : 'text-foreground')}>
            {driver.firstName} {driver.lastName}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {driver.employeeCode}
            {driver.phone ? ` · ${driver.phone}` : ''}
          </p>
        </div>

        {/* status */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          <span className={cn('text-[11px] font-medium', meta.dim ? 'text-muted-foreground' : 'text-foreground/80')}>
            {meta.label}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Vehicle row ──────────────────────────────────────────────────────────────

function VehicleRow({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: AvailableVehicle;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = vehicleStatusMeta(vehicle.status);
  const capacity = [
    vehicle.capacityKg ? `${vehicle.capacityKg} t` : null,
    vehicle.capacityM3 ? `${vehicle.capacityM3} m³` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-brand/60 bg-brand/[0.06]'
          : 'border-border/60 bg-background/30 hover:border-border hover:bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* radio */}
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-brand bg-brand' : 'border-border/70 bg-background',
          )}
        >
          {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </span>

        {/* icon */}
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            selected ? 'bg-brand/15 text-brand' : meta.dim ? 'bg-muted text-muted-foreground' : 'bg-brand/10 text-brand',
          )}
        >
          <Truck className="h-3.5 w-3.5" />
        </span>

        {/* info */}
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold leading-tight', meta.dim ? 'text-muted-foreground' : 'text-foreground')}>
            {vehicle.plateNumber}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {vehicle.type.toLowerCase().replace(/_/g, ' ')}
            {capacity ? ` · ${capacity}` : ''}
          </p>
        </div>

        {/* status */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          <span className={cn('text-[11px] font-medium', meta.dim ? 'text-muted-foreground' : 'text-foreground/80')}>
            {meta.label}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function DriverColumn({
  drivers,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: {
  drivers: AvailableDriver[];
  loading: boolean;
  error: string | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      drivers.filter((d) => {
        const q = search.toLowerCase();
        return (
          !q ||
          d.firstName.toLowerCase().includes(q) ||
          d.lastName.toLowerCase().includes(q) ||
          d.employeeCode.toLowerCase().includes(q) ||
          d.phone.includes(q)
        );
      }),
    [drivers, search],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <User className="h-3 w-3" />
        Driver
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search driver…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>
      <div className="max-h-[340px] space-y-1 overflow-y-auto pr-0.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {search ? 'No drivers match your search.' : 'No drivers available for this window.'}
          </p>
        ) : (
          filtered.map((d) => (
            <DriverRow
              key={d.id}
              driver={d}
              selected={selectedId === d.id}
              onSelect={() => onSelect(selectedId === d.id ? '' : d.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function VehicleColumn({
  vehicles,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: {
  vehicles: AvailableVehicle[];
  loading: boolean;
  error: string | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      vehicles.filter((v) => {
        const q = search.toLowerCase();
        return (
          !q ||
          v.plateNumber.toLowerCase().includes(q) ||
          v.vehicleCode.toLowerCase().includes(q) ||
          v.type.toLowerCase().includes(q)
        );
      }),
    [vehicles, search],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Truck className="h-3 w-3" />
        Vehicle
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search vehicle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>
      <div className="max-h-[340px] space-y-1 overflow-y-auto pr-0.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {search ? 'No vehicles match your search.' : 'No vehicles available for this window.'}
          </p>
        ) : (
          filtered.map((v) => (
            <VehicleRow
              key={v.id}
              vehicle={v}
              selected={selectedId === v.id}
              onSelect={() => onSelect(selectedId === v.id ? '' : v.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function AssignModal({
  open,
  onOpenChange,
  orderId,
  order,
  dispatch,
  initialTab = 'both',
  preselectedDriverId,
  preselectedVehicleId,
}: AssignModalProps) {
  const [tab, setTab] = useState<AssignTab>(initialTab);
  const [driverId, setDriverId] = useState(preselectedDriverId ?? '');
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId ?? '');

  const { assign, loading: assigning } = useAssignOrder();
  const {
    data: availability,
    loading: availLoading,
    error: availError,
    refetch: refetchAvail,
  } = useAvailability(
    { pickupDate: order.pickupDate, deliveryDate: order.deliveryDate },
    { enabled: open },
  );

  // Sync tab and preselections when modal opens
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setDriverId(preselectedDriverId ?? '');
      setVehicleId(preselectedVehicleId ?? '');
    }
  }, [open, initialTab, preselectedDriverId, preselectedVehicleId]);

  const isReassign = hasEffectiveAssignment(order, dispatch);
  const drivers = availability?.drivers ?? [];
  const vehicles = availability?.vehicles ?? [];

  const canSubmit =
    tab === 'both'
      ? Boolean(driverId && vehicleId)
      : tab === 'driver'
        ? Boolean(driverId)
        : Boolean(vehicleId);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload = {
      driverId: tab === 'vehicle' ? (order.driverId ?? driverId) : driverId,
      vehicleId: tab === 'driver' ? (order.vehicleId ?? vehicleId) : vehicleId,
    };
    if (!payload.driverId || !payload.vehicleId) {
      toast.error('Both driver and vehicle are required');
      return;
    }
    try {
      await assign(orderId, payload);
      toast.success(isReassign ? 'Reassigned successfully' : 'Driver & vehicle assigned');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to assign'));
    }
  };

  const confirmLabel = {
    both: assigning ? 'Assigning…' : isReassign ? 'Reassign Driver & Vehicle' : 'Assign Driver & Vehicle',
    driver: assigning ? 'Assigning…' : 'Assign Driver',
    vehicle: assigning ? 'Assigning…' : 'Assign Vehicle',
  }[tab];

  const helperText = (() => {
    if (tab !== 'both') return null;
    if (!driverId && !vehicleId) return 'Select a driver and vehicle to continue.';
    if (!driverId) return 'Select a driver to continue.';
    if (!vehicleId) return 'Select a vehicle to continue.';
    return null;
  })();

  const TABS: { value: AssignTab; label: string }[] = [
    { value: 'both', label: 'Driver & Vehicle' },
    { value: 'driver', label: 'Driver only' },
    { value: 'vehicle', label: 'Vehicle only' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[860px]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 px-6 py-4">
          <div>
            <DialogTitle className="text-base font-semibold">
              {isReassign ? 'Reassign Driver & Vehicle' : 'Assign Driver & Vehicle'}
            </DialogTitle>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-mono font-medium text-foreground/80">{order.orderNumber}</span>
              <span>·</span>
              <span>{order.pickupCity}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{order.deliveryCity}</span>
            </p>
          </div>
        </div>

        {/* Tab nav */}
        <div className="border-b border-border/60 px-6 py-3">
          <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === t.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === 'both' ? (
            <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <DriverColumn
                drivers={drivers}
                loading={availLoading}
                error={availError}
                selectedId={driverId}
                onSelect={setDriverId}
                onRetry={refetchAvail}
              />
              <VehicleColumn
                vehicles={vehicles}
                loading={availLoading}
                error={availError}
                selectedId={vehicleId}
                onSelect={setVehicleId}
                onRetry={refetchAvail}
              />
            </div>
          ) : tab === 'driver' ? (
            <DriverColumn
              drivers={drivers}
              loading={availLoading}
              error={availError}
              selectedId={driverId}
              onSelect={setDriverId}
              onRetry={refetchAvail}
            />
          ) : (
            <VehicleColumn
              vehicles={vehicles}
              loading={availLoading}
              error={availError}
              selectedId={vehicleId}
              onSelect={setVehicleId}
              onRetry={refetchAvail}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-4">
          <div className="min-w-0">
            {helperText && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {helperText}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canSubmit || assigning} onClick={handleSubmit}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
