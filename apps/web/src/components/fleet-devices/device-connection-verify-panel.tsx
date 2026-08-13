'use client';

import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useTelematicsDevice } from '@/lib/api/telematics-devices';
import { useTrackingVehicleQuery } from '@/lib/api/tracking';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  deriveGpsConnectionStatus,
  gpsConnectionStatusClass,
  gpsConnectionStatusHint,
  gpsConnectionStatusLabel,
} from '@/components/fleet-devices/gps-connection-status';
import { CheckCircle2, MapPinned, Radio } from 'lucide-react';

const POLL_MS = 4_000;

interface Props {
  deviceId: string;
  /// When true, poll while waiting for a real telemetry signal.
  poll?: boolean;
  showFleetTrackingCta?: boolean;
  className?: string;
}

export function DeviceConnectionVerifyPanel({
  deviceId,
  poll = true,
  showFleetTrackingCta = true,
  className,
}: Props) {
  const deviceQuery = useTelematicsDevice(deviceId, {
    enabled: !!deviceId,
    refetchInterval: poll ? POLL_MS : false,
  });

  const device = deviceQuery.data ?? null;
  const vehicleId = device?.vehicleId ?? null;

  const trackingQuery = useTrackingVehicleQuery(vehicleId, {
    enabled: !!vehicleId,
    refetchInterval: poll ? POLL_MS : false,
  });

  const connection = device
    ? deriveGpsConnectionStatus({
        device,
        tracking: trackingQuery.data ?? null,
        trackingError: !!vehicleId && trackingQuery.isError,
      })
    : null;

  if (deviceQuery.isLoading && !device) {
    return (
      <div className={cn('rounded-md border border-border bg-muted/20 p-4 text-sm', className)}>
        Checking connection…
      </div>
    );
  }

  if (!device || !connection) {
    return (
      <div className={cn('rounded-md border border-border bg-muted/20 p-4 text-sm', className)}>
        {deviceQuery.errorMessage ?? 'Device not found'}
      </div>
    );
  }

  const status = connection.status;
  const success = connection.isSuccessfullyConnected;
  const isPolling =
    poll &&
    !success &&
    status !== 'ARCHIVED' &&
    status !== 'INACTIVE';

  return (
    <div className={cn('space-y-4', className)} data-testid="device-connection-verify">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
            gpsConnectionStatusClass(status),
          )}
        >
          {success ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Radio className="h-3.5 w-3.5" aria-hidden />
          )}
          {gpsConnectionStatusLabel(status)}
        </span>
        {isPolling ? (
          <span className="text-xs text-muted-foreground">Checking every few seconds…</span>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">{gpsConnectionStatusHint(status)}</p>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Last seen</dt>
          <dd className="font-medium text-foreground">
            {connection.lastSeenAt
              ? `${formatRelativeTime(connection.lastSeenAt)} · ${formatDateTime(connection.lastSeenAt)}`
              : 'Not yet'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last position</dt>
          <dd className="font-medium text-foreground">
            {connection.lastPositionAt
              ? `${formatRelativeTime(connection.lastPositionAt)} · ${formatDateTime(connection.lastPositionAt)}`
              : 'Not yet'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Current location</dt>
          <dd className="font-mono text-xs text-foreground">
            {connection.latitude != null && connection.longitude != null
              ? `${connection.latitude.toFixed(5)}, ${connection.longitude.toFixed(5)}`
              : '—'}
          </dd>
        </div>
      </dl>

      {success ? (
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          <p className="font-medium">GPS device connected</p>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            <li>✓ Device registered in FlowERP</li>
            <li>{device.vehicleId ? '✓ Vehicle attached' : '○ No vehicle attached yet'}</li>
            <li>
              {connection.hasFreshPosition
                ? '✓ Last position received'
                : '✓ Device reported recently'}
            </li>
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void deviceQuery.refetch();
            if (vehicleId) void trackingQuery.refetch();
          }}
        >
          Check again
        </Button>
        {showFleetTrackingCta && device.vehicleId ? (
          <Button type="button" size="sm" asChild>
            <Link to="/app/fleet-tracking">
              <MapPinned className="mr-1.5 h-3.5 w-3.5" />
              Open Fleet Tracking
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
