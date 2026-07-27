import type { Geofence, GeofenceType } from '@/lib/api/telematics-geofences';
import type { GeofenceEventType } from '@/lib/api/telematics';

export type GeofenceLifecycle = 'active' | 'inactive' | 'archived';

export function geofenceLifecycle(fence: Geofence): GeofenceLifecycle {
  if (fence.archivedAt) return 'archived';
  if (!fence.active) return 'inactive';
  return 'active';
}

export function geofenceStatusLabel(status: GeofenceLifecycle): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'archived':
      return 'Archived';
  }
}

export function geofenceStatusClass(status: GeofenceLifecycle): string {
  switch (status) {
    case 'active':
      return 'bg-success/15 text-success';
    case 'inactive':
      return 'bg-muted text-muted-foreground';
    case 'archived':
      return 'bg-destructive/10 text-destructive';
  }
}

export function geofenceTypeLabel(type: GeofenceType): string {
  return type === 'CIRCLE' ? 'Circle' : 'Polygon';
}

export function geofenceEventLabel(type: GeofenceEventType): string {
  switch (type) {
    case 'ENTER':
      return 'Entered';
    case 'EXIT':
      return 'Exited';
    case 'DWELL':
      return 'Dwell';
  }
}

export function fenceMapColor(fence: Geofence, selected: boolean): string {
  if (fence.color && /^#[0-9A-Fa-f]{6}$/.test(fence.color)) {
    return fence.color;
  }
  return selected ? '#3b82f6' : '#64748b';
}

export function hasRenderableGeometry(fence: Geofence): boolean {
  if (fence.type === 'CIRCLE') {
    return (
      fence.centerLat != null &&
      fence.centerLng != null &&
      fence.radiusM != null &&
      fence.radiusM > 0
    );
  }
  return Array.isArray(fence.polygon) && fence.polygon.length >= 3;
}

export function formatRadiusM(radiusM: number | null | undefined): string {
  if (radiusM == null) return '—';
  if (radiusM >= 1000) return `${(radiusM / 1000).toFixed(1)} km`;
  return `${Math.round(radiusM)} m`;
}
