'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useCreateTelematicsDeviceMutation,
  type TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { useVehiclesList } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { DeviceSecretDialog } from '@/components/fleet-devices/device-secret-dialog';
import { providerLabel } from '@/components/fleet-providers/providers-ops';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: TelematicsProviderType;
  onCreated?: (deviceId: string) => void;
}

export function ProvidersCreateDeviceSheet({
  open,
  onOpenChange,
  provider,
  onCreated,
}: Props) {
  const create = useCreateTelematicsDeviceMutation();
  const vehicles = useVehiclesList(
    {
      page: 1,
      limit: 100,
      includeArchived: false,
      sortBy: 'plateNumber',
      sortOrder: 'asc',
    },
    { enabled: open },
  );
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<{
    ingestSecret: string;
    secretPrefix: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setExternalId('');
      setVehicleId('');
      setErrors({});
    }
  }, [open]);

  const vehicleOptions = useMemo(
    () => vehicles.items.filter((v) => !v.archivedAt),
    [vehicles.items],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Required';
    else if (name.trim().length > 120) next.name = 'Max 120 characters';
    if (!externalId.trim()) next.externalId = 'Required';
    else if (externalId.trim().length > 200) next.externalId = 'Max 200 characters';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        provider,
        externalId: externalId.trim(),
        vehicleId: vehicleId || undefined,
      });
      toast.success('Device registered — copy the ingest secret now');
      setSecret({
        ingestSecret: created.ingestSecret,
        secretPrefix: created.secretPrefix,
      });
      onOpenChange(false);
      onCreated?.(created.id);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create device'));
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Register {providerLabel(provider)} device</SheetTitle>
            <SheetDescription>
              Provider is fixed at create time. The ingest secret is shown once.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-4 flex flex-1 flex-col gap-4"
          >
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Input value={providerLabel(provider)} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-device-name">Name</Label>
              <Input
                id="prov-device-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-external-id">External ID</Label>
              <Input
                id="prov-external-id"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                maxLength={200}
              />
              {errors.externalId ? (
                <p className="text-xs text-destructive">{errors.externalId}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-vehicle">Assign vehicle</Label>
              <select
                id="prov-vehicle"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Unassigned</option>
                {vehicleOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                    {v.vehicleCode ? ` · ${v.vehicleCode}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-auto flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <DeviceSecretDialog
        open={!!secret}
        onOpenChange={(next) => {
          if (!next) setSecret(null);
        }}
        title="Ingest secret"
        description="Copy this secret now. It will not be shown again."
        ingestSecret={secret?.ingestSecret ?? null}
        secretPrefix={secret?.secretPrefix}
      />
    </>
  );
}
