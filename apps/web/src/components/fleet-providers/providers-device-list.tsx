'use client';

import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import type { TelematicsDevice } from '@/lib/api/telematics-devices';
import {
  deviceCommStatus,
  deviceCommStatusClass,
  deviceCommStatusLabel,
} from '@/components/fleet-providers/providers-ops';

const ROW_HEIGHT = 64;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 6;

interface Props {
  devices: TelematicsDevice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  vehicleLabelById: Map<string, string>;
  loading?: boolean;
}

export const ProvidersDeviceList = memo(function ProvidersDeviceList({
  devices,
  selectedId,
  onSelect,
  vehicleLabelById,
  loading,
}: Props) {
  const [scrollTop, setScrollTop] = useState(0);

  if (loading) {
    return (
      <div className="space-y-2 p-3" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted/50" />
        ))}
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs text-muted-foreground">
        No devices for this provider match the current filter.
      </p>
    );
  }

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN,
  );
  const visibleCount =
    Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(devices.length, startIndex + visibleCount);
  const visible = devices.slice(startIndex, endIndex);

  return (
    <div
      className="overflow-y-auto"
      style={{ height: Math.min(VIEWPORT_HEIGHT, devices.length * ROW_HEIGHT) }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      aria-label="Provider devices"
      role="listbox"
    >
      <div
        className="relative"
        style={{ height: devices.length * ROW_HEIGHT }}
      >
        {visible.map((device, visibleIndex) => {
          const index = startIndex + visibleIndex;
          const status = deviceCommStatus(device);
          const selected = device.id === selectedId;
          const vehicle =
            device.vehicleId
              ? vehicleLabelById.get(device.vehicleId)
              : null;
          return (
            <button
              key={device.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={cn(
                'absolute inset-x-0 flex h-[64px] flex-col justify-center gap-0.5 border-b border-border/40 px-3 text-left',
                'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                selected ? 'bg-brand/10' : 'hover:bg-muted/30',
              )}
              style={{ top: index * ROW_HEIGHT }}
              onClick={() => onSelect(device.id)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {device.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    deviceCommStatusClass(status),
                  )}
                >
                  {deviceCommStatusLabel(status)}
                </span>
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {device.externalId}
                {vehicle ? ` · ${vehicle}` : ' · Unassigned'}
                {device.lastSeenAt
                  ? ` · Last seen ${formatRelativeTime(device.lastSeenAt)}`
                  : ' · Never seen'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
