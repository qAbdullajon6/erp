'use client';

import { memo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DevicesEditSheet } from '@/components/fleet-devices/devices-edit-sheet';
import { DeviceSecretDialog } from '@/components/fleet-devices/device-secret-dialog';
import {
  useArchiveTelematicsDeviceMutation,
  useRestoreTelematicsDeviceMutation,
  useRotateDeviceSecretMutation,
  type TelematicsDevice,
} from '@/lib/api/telematics-devices';
import { describeError } from '@/lib/api/describe-error';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  deviceCommStatus,
  deviceCommStatusClass,
  deviceCommStatusLabel,
  maskedSecretHint,
  providerLabel,
} from '@/components/fleet-providers/providers-ops';
import { toast } from 'sonner';
import {
  Archive,
  Edit2,
  ExternalLink,
  KeyRound,
  RotateCcw,
} from 'lucide-react';

interface Props {
  device: TelematicsDevice | null;
  vehicleLabel: string | null;
  loading?: boolean;
}

export const ProvidersDevicePanel = memo(function ProvidersDevicePanel({
  device,
  vehicleLabel,
  loading,
}: Props) {
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

  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted/60" />
        <div className="h-32 animate-pulse rounded bg-muted/40" />
      </div>
    );
  }

  if (!device) {
    return (
      <p className="px-4 py-10 text-center text-xs text-muted-foreground">
        Select a device to view health, assignment, and secrets.
      </p>
    );
  }

  const status = deviceCommStatus(device);
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
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {device.name}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {device.externalId}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
            deviceCommStatusClass(status),
          )}
        >
          {deviceCommStatusLabel(status)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!archived ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setEditOpen(true)}
            >
              <Edit2 className="mr-1.5 h-3.5 w-3.5" />
              Assign / edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setRotateOpen(true)}
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Rotate secret
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Archive
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void handleRestore()}
            disabled={restore.isPending}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {restore.isPending ? 'Restoring…' : 'Restore'}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8" asChild>
          <Link to="/app/devices/$deviceId" params={{ deviceId: device.id }}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Device page
          </Link>
        </Button>
      </div>

      <dl className="grid gap-2 text-xs">
        <Row label="Provider" value={providerLabel(device.provider)} />
        <Row label="Status" value={deviceCommStatusLabel(status)} />
        <Row label="Enabled" value={device.active ? 'Yes' : 'No'} />
        <Row
          label="Linked vehicle"
          value={vehicleLabel ?? (device.vehicleId ? 'Unknown vehicle' : 'Unassigned')}
        />
        <Row
          label="Last communication"
          value={
            device.lastSeenAt
              ? `${formatRelativeTime(device.lastSeenAt)} (${formatDateTime(device.lastSeenAt)})`
              : 'Never'
          }
        />
        {/* These rows named the reason the product could not answer rather than
            answering: "no provider health endpoint on devices", "provider is
            immutable after create". Last communication above is the health
            signal, and a device that needs a different provider is registered
            again under that provider. */}
        <Row
          label="Ingest secret"
          value={maskedSecretHint(device.hasIngestSecret)}
        />
        <Row label="Created" value={formatDateTime(device.createdAt)} />
        <Row label="Updated" value={formatDateTime(device.updatedAt)} />
        {device.archivedAt ? (
          <Row label="Archived" value={formatDateTime(device.archivedAt)} />
        ) : null}
      </dl>

      <DevicesEditSheet
        device={device}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

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
        description="The current secret stops working immediately. The new secret is shown once."
        confirmLabel={rotate.isPending ? 'Rotating…' : 'Rotate'}
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
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
