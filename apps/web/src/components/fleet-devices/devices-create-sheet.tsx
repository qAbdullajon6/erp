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
  TELEMATICS_PROVIDERS,
  useCreateTelematicsDeviceMutation,
  type TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { useVehiclesList } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { providerLabel } from '@/components/fleet-devices/devices-ops';
import { DeviceSecretDialog } from '@/components/fleet-devices/device-secret-dialog';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (deviceId: string) => void;
}

type FormState = {
  name: string;
  provider: TelematicsProviderType;
  externalId: string;
  vehicleId: string;
};

const EMPTY: FormState = {
  name: '',
  provider: 'TRACCAR',
  externalId: '',
  vehicleId: '',
};

export function DevicesCreateSheet({ open, onOpenChange, onCreated }: Props) {
  const create = useCreateTelematicsDeviceMutation();
  const vehicles = useVehiclesList(
    { page: 1, limit: 100, includeArchived: false, sortBy: 'plateNumber', sortOrder: 'asc' },
    { enabled: open },
  );
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<{
    ingestSecret: string;
    secretPrefix: string;
    deviceId: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setErrors({});
    }
  }, [open]);

  const vehicleOptions = useMemo(
    () => vehicles.items.filter((v) => !v.archivedAt),
    [vehicles.items],
  );

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Required';
    else if (form.name.trim().length > 120) next.name = 'Max 120 characters';
    if (!form.externalId.trim()) next.externalId = 'Required';
    else if (form.externalId.trim().length > 200) next.externalId = 'Max 200 characters';
    if (!form.provider) next.provider = 'Required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const created = await create.mutateAsync({
        name: form.name.trim(),
        provider: form.provider,
        externalId: form.externalId.trim(),
        vehicleId: form.vehicleId || undefined,
      });
      toast.success('Device registered — copy the ingest secret now');
      setSecret({
        ingestSecret: created.ingestSecret,
        secretPrefix: created.secretPrefix,
        deviceId: created.id,
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
            <SheetTitle>Register device</SheetTitle>
            <SheetDescription>
              Create a GPS unit from an existing provider. The ingest secret is shown once.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 flex flex-1 flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-name">Name</Label>
              <Input
                id="device-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Tractor unit GPS"
                maxLength={120}
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="device-provider">Provider</Label>
              <select
                id="device-provider"
                value={form.provider}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    provider: e.target.value as TelematicsProviderType,
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TELEMATICS_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {providerLabel(p)}
                  </option>
                ))}
              </select>
              {errors.provider ? (
                <p className="text-xs text-destructive">{errors.provider}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="device-external-id">External ID</Label>
              <Input
                id="device-external-id"
                value={form.externalId}
                onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
                placeholder="Provider unit id"
                maxLength={200}
                className="font-mono"
              />
              {errors.externalId ? (
                <p className="text-xs text-destructive">{errors.externalId}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="device-vehicle">Connected vehicle (optional)</Label>
              <select
                id="device-vehicle"
                value={form.vehicleId}
                onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                {create.isPending ? 'Registering…' : 'Register device'}
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
