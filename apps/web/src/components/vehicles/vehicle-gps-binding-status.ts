import { Archive, Clock3, Radio, RadioTower, Wifi, WifiOff } from 'lucide-react';
import type { TelematicsDevice } from '@/lib/api/telematics-devices';
import type { TrackingVehicle } from '@/lib/api/tracking';

const RECENT_DEVICE_MS = 10 * 60 * 1000;

export type GpsBindingConnectionPresentation = {
  label: string;
  detail: string;
  className: string;
  icon: typeof Wifi;
};

export function gpsBindingConnectionPresentation(
  device: Pick<TelematicsDevice, 'active' | 'archivedAt' | 'lastSeenAt'>,
  tracking: Pick<TrackingVehicle, 'isStale' | 'lastReceivedAt'> | null,
  now = Date.now(),
): GpsBindingConnectionPresentation {
  if (device.archivedAt) {
    return {
      label: 'Device archived',
      detail: 'This device cannot accept telemetry.',
      className: 'bg-muted text-muted-foreground',
      icon: Archive,
    };
  }
  if (!device.active) {
    return {
      label: 'Device inactive',
      detail: 'Enable the device before expecting telemetry.',
      className: 'bg-muted text-muted-foreground',
      icon: Radio,
    };
  }
  if (tracking && !tracking.isStale) {
    return {
      label: 'Online',
      detail: 'A fresh vehicle position is available.',
      className: 'bg-success/15 text-success',
      icon: Wifi,
    };
  }
  const lastSeenMs = device.lastSeenAt ? Date.parse(device.lastSeenAt) : Number.NaN;
  if (Number.isFinite(lastSeenMs) && now - lastSeenMs <= RECENT_DEVICE_MS) {
    return {
      label: 'Device online',
      detail: 'The device checked in recently; the latest position may still be processing.',
      className: 'bg-success/15 text-success',
      icon: RadioTower,
    };
  }
  if (tracking?.isStale || Number.isFinite(lastSeenMs)) {
    return {
      label: 'Offline / stale',
      detail: 'No recent GPS update is available.',
      className: 'bg-warning/15 text-warning',
      icon: WifiOff,
    };
  }
  return {
    label: 'Waiting for first signal',
    detail: 'The binding exists, but FlowERP has not received telemetry yet.',
    className: 'bg-warning/15 text-warning',
    icon: Clock3,
  };
}
