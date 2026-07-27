'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { Geofence } from '@/lib/api/telematics-geofences';
import {
  formatRadiusM,
  geofenceLifecycle,
  geofenceStatusClass,
  geofenceStatusLabel,
  geofenceTypeLabel,
  hasRenderableGeometry,
} from '@/components/fleet-geofences/geofences-ops';

interface Props {
  fences: Geofence[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  customerNameById: Map<string, string>;
  loading?: boolean;
}

export const GeofencesList = memo(function GeofencesList({
  fences,
  selectedId,
  onSelect,
  customerNameById,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-md bg-muted/60"
          />
        ))}
      </div>
    );
  }

  if (fences.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs text-muted-foreground">
        No geofences match this filter.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/50" role="listbox" aria-label="Geofences">
      {fences.map((fence) => {
        const status = geofenceLifecycle(fence);
        const selected = fence.id === selectedId;
        const customer =
          fence.linkedCustomerId
            ? customerNameById.get(fence.linkedCustomerId)
            : null;
        return (
          <li key={fence.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              className={cn(
                'flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                selected ? 'bg-brand/10' : 'hover:bg-muted/30',
              )}
              onClick={() => onSelect(fence.id)}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {fence.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    geofenceStatusClass(status),
                  )}
                >
                  {geofenceStatusLabel(status)}
                </span>
              </span>
              <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{geofenceTypeLabel(fence.type)}</span>
                {fence.type === 'CIRCLE' ? (
                  <span>{formatRadiusM(fence.radiusM)}</span>
                ) : (
                  <span>
                    {fence.polygon?.length ?? 0} vertices
                  </span>
                )}
                {fence.category ? <span>{fence.category}</span> : null}
                {customer ? <span>{customer}</span> : null}
                {!hasRenderableGeometry(fence) ? (
                  <span className="text-destructive">No geometry</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
});
