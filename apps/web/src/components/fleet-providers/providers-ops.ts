import type {
  TelematicsDevice,
  TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { TELEMATICS_PROVIDERS } from '@/lib/api/telematics-devices';
import { providerLabel } from '@/components/fleet-devices/devices-ops';

export { providerLabel, TELEMATICS_PROVIDERS };

/// Device communication status derived only from backend fields —
/// never from invented heartbeat windows.
export type DeviceCommStatus =
  | 'connected'
  | 'disconnected'
  | 'waiting'
  | 'archived'
  | 'unknown';

export function deviceCommStatus(device: TelematicsDevice): DeviceCommStatus {
  if (device.archivedAt) return 'archived';
  if (!device.active) return 'disconnected';
  if (device.lastSeenAt == null) return 'waiting';
  if (device.lastSeenAt) return 'connected';
  return 'unknown';
}

export function deviceCommStatusLabel(status: DeviceCommStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'waiting':
      return 'Waiting';
    case 'archived':
      return 'Archived';
    case 'unknown':
      return 'Unknown';
  }
}

export function deviceCommStatusClass(status: DeviceCommStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-success/15 text-success';
    case 'disconnected':
      return 'bg-muted text-muted-foreground';
    case 'waiting':
      return 'bg-warning/15 text-warning';
    case 'archived':
      return 'bg-destructive/10 text-destructive';
    case 'unknown':
      return 'bg-muted text-muted-foreground';
  }
}

export function isTelematicsProvider(
  value: string,
): value is TelematicsProviderType {
  return (TELEMATICS_PROVIDERS as string[]).includes(value);
}

export function providerDescription(provider: TelematicsProviderType): string {
  switch (provider) {
    case 'MANUAL':
      return 'Manual / test ingest payloads normalized by the Manual provider.';
    case 'TRACCAR':
      return 'Traccar-shaped position payloads.';
    case 'SAMSARA':
      return 'Samsara-shaped position payloads.';
    case 'GEOTAB':
      return 'Geotab-shaped position payloads.';
    case 'GENERIC_WEBHOOK':
      return 'Generic webhook ingest payloads.';
  }
}

export interface ProviderSummary {
  provider: TelematicsProviderType;
  total: number;
  active: number;
  inactive: number;
  archived: number;
  assigned: number;
  withSecret: number;
  /// Max lastSeenAt among loaded devices — null if none have communicated.
  lastSeenAt: string | null;
  /// True when meta.total exceeded the loaded page (aggregates are partial).
  aggregatesPartial: boolean;
  loaded: TelematicsDevice[];
}

export function summarizeProviderDevices(
  provider: TelematicsProviderType,
  items: TelematicsDevice[],
  total: number,
): ProviderSummary {
  let active = 0;
  let inactive = 0;
  let archived = 0;
  let assigned = 0;
  let withSecret = 0;
  let lastSeenAt: string | null = null;

  for (const device of items) {
    if (device.archivedAt) archived += 1;
    else if (device.active) active += 1;
    else inactive += 1;
    if (device.vehicleId) assigned += 1;
    if (device.hasIngestSecret) withSecret += 1;
    if (
      device.lastSeenAt &&
      (!lastSeenAt || device.lastSeenAt > lastSeenAt)
    ) {
      lastSeenAt = device.lastSeenAt;
    }
  }

  return {
    provider,
    total,
    active,
    inactive,
    archived,
    assigned,
    withSecret,
    lastSeenAt,
    aggregatesPartial: total > items.length,
    loaded: items,
  };
}

export function maskedSecretHint(hasIngestSecret: boolean): string {
  if (!hasIngestSecret) return 'Not set';
  return '•••••••• (hash only — plaintext never stored)';
}
