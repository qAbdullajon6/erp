import type { TelematicsDevice, TelematicsProviderType } from '@/lib/api/telematics-devices';

export type DeviceLifecycleStatus = 'active' | 'inactive' | 'archived';

export function deviceLifecycleStatus(device: TelematicsDevice): DeviceLifecycleStatus {
  if (device.archivedAt) return 'archived';
  if (!device.active) return 'inactive';
  return 'active';
}

export function deviceStatusLabel(status: DeviceLifecycleStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'archived':
      return 'Archived';
  }
}

export function deviceStatusClass(status: DeviceLifecycleStatus): string {
  switch (status) {
    case 'active':
      return 'bg-success/15 text-success';
    case 'inactive':
      return 'bg-muted text-muted-foreground';
    case 'archived':
      return 'bg-destructive/10 text-destructive';
  }
}

export function providerLabel(provider: TelematicsProviderType): string {
  switch (provider) {
    case 'MANUAL':
      return 'Manual';
    case 'TRACCAR':
      return 'Traccar';
    case 'SAMSARA':
      return 'Samsara';
    case 'GEOTAB':
      return 'Geotab';
    case 'GENERIC_WEBHOOK':
      return 'Generic webhook';
  }
}
