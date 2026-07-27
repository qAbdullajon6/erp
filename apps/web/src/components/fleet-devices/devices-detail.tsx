'use client';

import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingState, ErrorState } from '@/components/shared/list-states';
import {
  useArchiveTelematicsDeviceMutation,
  useRestoreTelematicsDeviceMutation,
  useRotateDeviceSecretMutation,
  useTelematicsDevice,
} from '@/lib/api/telematics-devices';
import { useVehicle } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  deviceLifecycleStatus,
  deviceStatusClass,
  deviceStatusLabel,
  providerLabel,
} from '@/components/fleet-devices/devices-ops';
import { DevicesEditSheet } from '@/components/fleet-devices/devices-edit-sheet';
import { DeviceSecretDialog } from '@/components/fleet-devices/device-secret-dialog';
import { toast } from 'sonner';
import {
  Archive,
  ArrowLeft,
  Edit2,
  KeyRound,
  RotateCcw,
  Truck,
} from 'lucide-react';

interface Props {
  deviceId: string;
}

export function DevicesDetail({ deviceId }: Props) {
  const navigate = useNavigate();
  const deviceQuery = useTelematicsDevice(deviceId);
  const device = deviceQuery.data ?? null;
  const vehicleQuery = useVehicle(device?.vehicleId ?? '', {
    enabled: !!device?.vehicleId,
  });

  const archive = useArchiveTelematicsDeviceMutation();
  const restore = useRestoreTelematicsDeviceMutation();
  const rotate = useRotateDeviceSecretMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [secretReveal, setSecretReveal] = useState<{
    ingestSecret: string;
    secretPrefix: string;
  } | null>(null);

  if (deviceQuery.isLoading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading device…" />
      </div>
    );
  }

  if (deviceQuery.isError || !device) {
    return (
      <div className="p-6">
        <ErrorState
          message={deviceQuery.errorMessage ?? 'Device not found. It may have been removed.'}
          onRetry={() => void deviceQuery.refetch()}
        />
      </div>
    );
  }

  const status = deviceLifecycleStatus(device);
  const archived = Boolean(device.archivedAt);

  const handleArchive = async () => {
    try {
      await archive.mutateAsync(device.id);
      toast.success('Device archived');
      setArchiveOpen(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to archive device'));
    }
  };

  const handleRestore = async () => {
    try {
      await restore.mutateAsync(device.id);
      toast.success('Device restored');
    } catch (err) {
      toast.error(describeError(err, 'Failed to restore device'));
    }
  };

  const handleRotate = async () => {
    try {
      const result = await rotate.mutateAsync(device.id);
      setRotateOpen(false);
      setSecretReveal({
        ingestSecret: result.ingestSecret,
        secretPrefix: result.secretPrefix,
      });
      toast.success('Secret rotated — copy it now');
    } catch (err) {
      toast.error(describeError(err, 'Failed to rotate secret'));
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6" data-testid="device-detail-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 h-8 px-2 text-muted-foreground"
            onClick={() => void navigate({ to: '/app/devices' })}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Devices
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              {device.name}
            </h1>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                deviceStatusClass(status),
              )}
            >
              {deviceStatusLabel(status)}
            </span>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{device.externalId}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {!archived ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRotateOpen(true)}>
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                Rotate secret
              </Button>
              <Button size="sm" variant="outline" onClick={() => setArchiveOpen(true)}>
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Archive
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRestore()}
              disabled={restore.isPending}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border/60 bg-surface p-4">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Device
          </h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Name">{device.name}</Row>
            <Row label="Provider">{providerLabel(device.provider)}</Row>
            <Row label="External ID" mono>
              {device.externalId}
            </Row>
            <Row label="Status">{deviceStatusLabel(status)}</Row>
            <Row label="Active">{device.active ? 'Yes' : 'No'}</Row>
            <Row label="Ingest secret">
              {device.hasIngestSecret ? 'Configured' : 'Not set'}
            </Row>
            <Row label="Last seen">
              {device.lastSeenAt
                ? `${formatRelativeTime(device.lastSeenAt)} (${formatDateTime(device.lastSeenAt)})`
                : 'Never'}
            </Row>
            <Row label="Created">{formatDateTime(device.createdAt)}</Row>
            <Row label="Updated">{formatDateTime(device.updatedAt)}</Row>
            {device.archivedAt ? (
              <Row label="Archived">{formatDateTime(device.archivedAt)}</Row>
            ) : null}
          </dl>
        </section>

        <section className="rounded-lg border border-border/60 bg-surface p-4">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Connected vehicle
          </h2>
          {!device.vehicleId ? (
            <p className="text-sm text-muted-foreground">No vehicle bound to this device.</p>
          ) : vehicleQuery.loading ? (
            <p className="text-sm text-muted-foreground">Loading vehicle…</p>
          ) : vehicleQuery.data ? (
            <div className="space-y-3">
              <dl className="space-y-2.5 text-sm">
                <Row label="Plate" mono>
                  {vehicleQuery.data.plateNumber}
                </Row>
                <Row label="Code" mono>
                  {vehicleQuery.data.vehicleCode}
                </Row>
                <Row label="Type">{vehicleQuery.data.type}</Row>
                <Row label="Status">{vehicleQuery.data.status}</Row>
              </dl>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/vehicles/$vehicleId" params={{ vehicleId: device.vehicleId }}>
                  <Truck className="mr-1.5 h-3.5 w-3.5" />
                  Open vehicle
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bound to vehicle{' '}
              <span className="font-mono">{device.vehicleId.slice(0, 8)}…</span> (details
              unavailable).
            </p>
          )}
        </section>
      </div>

      <DevicesEditSheet device={device} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive device?"
        description="Archived devices stop accepting ingest. You can restore them later."
        confirmLabel={archive.isPending ? 'Archiving…' : 'Archive'}
        destructive
        onConfirm={() => void handleArchive()}
      />

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="Rotate ingest secret?"
        description="The current secret stops working immediately. Copy the new secret after rotation — it is shown only once."
        confirmLabel={rotate.isPending ? 'Rotating…' : 'Rotate secret'}
        destructive
        onConfirm={() => void handleRotate()}
      />

      <DeviceSecretDialog
        open={!!secretReveal}
        onOpenChange={(next) => {
          if (!next) setSecretReveal(null);
        }}
        title="New ingest secret"
        description="Copy this secret now. It will not be shown again."
        ingestSecret={secretReveal?.ingestSecret ?? null}
        secretPrefix={secretReveal?.secretPrefix}
      />
    </div>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right text-foreground', mono && 'font-mono text-xs')}>
        {children}
      </dd>
    </div>
  );
}
