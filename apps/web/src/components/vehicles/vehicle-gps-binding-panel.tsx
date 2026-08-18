'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Link2, Radio, Unlink } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/list-states';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  type TelematicsDevice,
  useTelematicsDevicesList,
  useUpdateTelematicsDeviceMutation,
} from '@/lib/api/telematics-devices';
import { gpsBindingConnectionPresentation } from '@/components/vehicles/vehicle-gps-binding-status';
import { describeError } from '@/lib/api/describe-error';
import { useTrackingVehicleQuery } from '@/lib/api/tracking';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VehicleGpsBindingPanelProps {
  vehicle: {
    id: string;
    plateNumber: string;
    archivedAt: string | null;
  };
}

export function VehicleGpsBindingPanel({ vehicle }: VehicleGpsBindingPanelProps) {
  const [bindOpen, setBindOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const boundQuery = useTelematicsDevicesList({
    page: 1,
    limit: 100,
    vehicleId: vehicle.id,
    includeArchived: false,
  });
  const availableQuery = useTelematicsDevicesList(
    { page: 1, limit: 100, assignment: 'UNASSIGNED', includeArchived: false },
    { enabled: bindOpen },
  );
  const trackingQuery = useTrackingVehicleQuery(vehicle.id, {
    enabled: boundQuery.items.length > 0 && !vehicle.archivedAt,
    refetchInterval: 30_000,
  });
  const update = useUpdateTelematicsDeviceMutation();

  const availableDevices = availableQuery.items.filter((device) => device.active);

  const handleBind = async () => {
    if (!selectedDeviceId || vehicle.archivedAt) return;
    try {
      await update.mutateAsync({
        id: selectedDeviceId,
        input: { vehicleId: vehicle.id },
      });
      toast.success(`GPS device bound to ${vehicle.plateNumber}`);
      setSelectedDeviceId('');
      setBindOpen(false);
    } catch (error) {
      toast.error(describeError(error, 'Failed to bind GPS device'));
    }
  };

  const handleUnbind = async (device: TelematicsDevice) => {
    try {
      await update.mutateAsync({
        id: device.id,
        input: { vehicleId: null },
      });
      toast.success(`${device.name} unbound from ${vehicle.plateNumber}`);
    } catch (error) {
      toast.error(describeError(error, 'Failed to unbind GPS device'));
    }
  };

  return (
    <>
      <div className="space-y-3" data-testid="vehicle-gps-binding-panel">
        {vehicle.archivedAt ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            This vehicle is archived. Its existing binding is visible for cleanup, but new GPS
            devices cannot be attached and telemetry is rejected.
          </div>
        ) : null}

        {boundQuery.isLoading ? (
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-5 text-sm text-muted-foreground">
            Loading GPS binding…
          </div>
        ) : boundQuery.errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            {boundQuery.errorMessage}
          </div>
        ) : boundQuery.items.length === 0 ? (
          <EmptyState
            compact
            icon={Radio}
            title="No GPS device bound"
            description="Bind a registered device or register a new tracker for this vehicle."
          />
        ) : (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
            {boundQuery.items.map((device) => {
              const connection = gpsBindingConnectionPresentation(
                device,
                trackingQuery.data ?? null,
              );
              const ConnectionIcon = connection.icon;
              const lastGpsAt =
                trackingQuery.data?.lastReceivedAt ?? trackingQuery.data?.lastRecordedAt ?? null;
              return (
                <li key={device.id} className="space-y-3 bg-surface px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to="/app/devices/$deviceId"
                        params={{ deviceId: device.id }}
                        className="text-sm font-semibold text-brand hover:underline"
                      >
                        {device.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        IMEI / ID: {device.externalId}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Provider: {device.provider}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                        connection.className,
                      )}
                      title={connection.detail}
                    >
                      <ConnectionIcon className="h-3.5 w-3.5" aria-hidden />
                      {connection.label}
                    </span>
                  </div>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Device last seen</dt>
                      <dd className="font-medium text-foreground" title={device.lastSeenAt ? formatDateTime(device.lastSeenAt) : undefined}>
                        {device.lastSeenAt ? formatRelativeTime(device.lastSeenAt) : 'Not yet'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last GPS received</dt>
                      <dd className="font-medium text-foreground" title={lastGpsAt ? formatDateTime(lastGpsAt) : undefined}>
                        {lastGpsAt ? formatRelativeTime(lastGpsAt) : 'Not yet'}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/app/devices/$deviceId" params={{ deviceId: device.id }}>
                        Manage device
                      </Link>
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={update.isPending}
                        >
                          <Unlink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Unbind
                        </Button>
                      }
                      title={`Unbind ${device.name}?`}
                      description={`Incoming telemetry will stop resolving to ${vehicle.plateNumber} until the device is bound again.`}
                      confirmLabel={update.isPending ? 'Unbinding…' : 'Unbind device'}
                      onConfirm={() => handleUnbind(device)}
                      destructive
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!vehicle.archivedAt ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setBindOpen(true)}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Bind existing device
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link
                to="/app/devices"
                search={{ create: true, vehicleId: vehicle.id }}
              >
                Register new device
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Sheet open={bindOpen} onOpenChange={setBindOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Bind GPS device</SheetTitle>
            <SheetDescription>
              Select an unassigned device from this organization for {vehicle.plateNumber}.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 flex-1 space-y-2">
            <Label htmlFor="vehicle-gps-device">Available device</Label>
            <select
              id="vehicle-gps-device"
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              disabled={availableQuery.isLoading || update.isPending}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">
                {availableQuery.isLoading ? 'Loading devices…' : 'Select a device'}
              </option>
              {availableDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name} · {device.externalId}
                </option>
              ))}
            </select>
            {availableQuery.errorMessage ? (
              <p className="text-xs text-destructive">{availableQuery.errorMessage}</p>
            ) : null}
            {!availableQuery.isLoading &&
            !availableQuery.errorMessage &&
            availableDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active unassigned devices are available. Register a device first.
              </p>
            ) : null}
          </div>

          <SheetFooter className="gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setBindOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedDeviceId || update.isPending}
              onClick={() => void handleBind()}
            >
              {update.isPending ? 'Binding…' : 'Bind device'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
