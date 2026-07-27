'use client';

import { memo, useCallback, useState } from 'react';
import { EmptyState } from '@/components/shared/list-states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import type { TrackingVehicle } from '@/lib/api/tracking';
import type { ApiDispatch } from '@/lib/api/dispatches';
import {
  hasCoordinates,
  movementLabel,
  movementToneClass,
  trackingAvailability,
  trackingAvailabilityClass,
  trackingAvailabilityLabel,
  vehicleDisplayName,
  vehicleSecondaryCode,
  type FleetOpsContext,
} from '@/components/fleet-tracking/fleet-ops';
import { Focus, Truck, X } from 'lucide-react';

const ROW_HEIGHT = 72;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN = 6;

interface Props {
  vehicles: TrackingVehicle[];
  selectedVehicleId: string | null;
  selectedIds: Set<string>;
  dispatchIndex: Map<string, FleetOpsContext>;
  onSelectVehicle: (vehicleId: string, opts?: { additive?: boolean }) => void;
  onClearSelection: () => void;
  onFitSelected: () => void;
}

export function VehicleSidebar({
  vehicles,
  selectedVehicleId,
  selectedIds,
  dispatchIndex,
  onSelectVehicle,
  onClearSelection,
  onFitSelected,
}: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const selectedCount = selectedIds.size;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(vehicles.length, startIndex + visibleCount);
  const visible = vehicles.slice(startIndex, endIndex);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/50 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fleet · {vehicles.length}
        </p>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-1.5 border-b border-border/50 bg-brand/5 px-3 py-2">
          <span className="flex-1 text-xs font-medium text-foreground">
            {selectedCount} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={onFitSelected}
          >
            <Focus className="mr-1 h-3 w-3" />
            Fit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px]"
            onClick={onClearSelection}
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
        role="listbox"
        aria-label="Fleet vehicles"
        aria-multiselectable="true"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {vehicles.length === 0 ? (
          <EmptyState
            compact
            icon={Truck}
            title="No matching units"
            description="Try another filter or clear search."
          />
        ) : (
          <div className="relative" style={{ height: vehicles.length * ROW_HEIGHT }}>
            {visible.map((vehicle, visibleIndex) => {
              const index = startIndex + visibleIndex;
              return (
                <FleetVehicleCard
                  key={vehicle.vehicleId}
                  vehicle={vehicle}
                  liveDispatch={dispatchIndex.get(vehicle.vehicleId)?.liveDispatch ?? null}
                  selected={selectedVehicleId === vehicle.vehicleId}
                  multiSelected={selectedIds.has(vehicle.vehicleId)}
                  style={{ top: index * ROW_HEIGHT }}
                  onSelect={onSelectVehicle}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const FleetVehicleCard = memo(function FleetVehicleCard({
  vehicle,
  liveDispatch,
  selected,
  multiSelected,
  style,
  onSelect,
}: {
  vehicle: TrackingVehicle;
  liveDispatch: ApiDispatch | null;
  selected: boolean;
  multiSelected: boolean;
  style: { top: number };
  onSelect: (id: string, opts?: { additive?: boolean }) => void;
}) {
  const track = trackingAvailability(vehicle, { liveDispatch });
  const code = vehicleSecondaryCode(vehicle);

  const handleSelect = useCallback(
    (additive: boolean) => onSelect(vehicle.vehicleId, { additive }),
    [onSelect, vehicle.vehicleId],
  );

  return (
    <div
      role="option"
      aria-selected={selected || multiSelected}
      className="absolute inset-x-0"
      style={{ height: ROW_HEIGHT, ...style }}
    >
      <div
        className={cn(
          'group flex h-full w-full border-l-[3px] border-b border-border/40 text-left transition-colors',
          selected
            ? 'border-l-brand bg-brand/5'
            : multiSelected
              ? 'border-l-brand/50 bg-brand/[0.03]'
              : 'border-l-transparent hover:bg-muted/25',
        )}
      >
        <button
          type="button"
          className="flex shrink-0 items-start px-2 pt-3.5"
          aria-label={multiSelected ? 'Deselect vehicle' : 'Select vehicle'}
          onClick={(e) => {
            e.stopPropagation();
            handleSelect(true);
          }}
        >
          <Checkbox
            checked={multiSelected || selected}
            onCheckedChange={() => handleSelect(true)}
            aria-hidden
            tabIndex={-1}
          />
        </button>
        <button
          type="button"
          onClick={(e) => handleSelect(e.shiftKey)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSelect(e.shiftKey);
            }
          }}
          className="min-w-0 flex-1 px-1 py-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-mono text-sm font-semibold text-foreground">
                  {vehicleDisplayName(vehicle)}
                </span>
                {code && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{code}</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {vehicle.driverName || 'No driver'}
                {liveDispatch?.dispatchNumber ? ` · ${liveDispatch.dispatchNumber}` : ''}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {liveDispatch?.order?.orderNumber
                  ? `Order ${liveDispatch.order.orderNumber}`
                  : 'No live dispatch'}
                {liveDispatch?.order?.pickupCity
                  ? ` · ${liveDispatch.order.pickupCity} → ${liveDispatch.order.deliveryCity}`
                  : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={cn(
                  'rounded-full px-1.5 py-0 text-[10px] font-semibold leading-4',
                  movementToneClass(vehicle.movementState),
                )}
              >
                {movementLabel(vehicle.movementState)}
              </span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0 text-[10px] font-semibold leading-4',
                  trackingAvailabilityClass(track),
                )}
              >
                {trackingAvailabilityLabel(track)}
              </span>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            {!hasCoordinates(vehicle) && <span>Map pin unavailable</span>}
            {vehicle.lastReceivedAt && (
              <span title={vehicle.lastReceivedAt}>
                Updated {formatRelativeTime(vehicle.lastReceivedAt)}
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
});
