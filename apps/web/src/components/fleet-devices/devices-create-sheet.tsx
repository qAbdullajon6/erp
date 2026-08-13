'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
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
  type TelematicsDeviceCreated,
  type TelematicsProviderType,
} from '@/lib/api/telematics-devices';
import { useVehiclesList } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { providerLabel } from '@/components/fleet-devices/devices-ops';
import { DeviceConnectionVerifyPanel } from '@/components/fleet-devices/device-connection-verify-panel';
import { GatewaySetupChecklist } from '@/components/fleet-devices/gateway-setup-checklist';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (deviceId: string) => void;
  /// Prefill when opened from a vehicle detail deep-link.
  defaultVehicleId?: string;
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

const STEPS = [
  { id: 1, label: 'Vehicle' },
  { id: 2, label: 'Provider' },
  { id: 3, label: 'Device' },
  { id: 4, label: 'Gateway' },
  { id: 5, label: 'Verify' },
] as const;

function providerSupportNote(provider: TelematicsProviderType): string {
  switch (provider) {
    case 'TRACCAR':
      return 'Primary supported gateway. Your GPS hardware sends data to Traccar; Traccar forwards positions into FlowERP.';
    case 'MANUAL':
      return 'For test / manual ingest payloads. Not a physical hardware gateway.';
    case 'SAMSARA':
    case 'GEOTAB':
    case 'GENERIC_WEBHOOK':
      return 'Payload format is accepted when forwarded to FlowERP. End-to-end hardware setup is not guided here yet.';
  }
}

function looksLikeImei(value: string): boolean {
  return /^\d{15}$/.test(value.trim());
}

export function DevicesCreateSheet({
  open,
  onOpenChange,
  onCreated,
  defaultVehicleId,
}: Props) {
  const create = useCreateTelematicsDeviceMutation();
  const vehicles = useVehiclesList(
    { page: 1, limit: 100, includeArchived: false, sortBy: 'plateNumber', sortOrder: 'asc' },
    { enabled: open },
  );
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<TelematicsDeviceCreated | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [secretSaved, setSecretSaved] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(EMPTY);
      setErrors({});
      setCreated(null);
      setSecretCopied(false);
      setSecretSaved(false);
      return;
    }
    if (defaultVehicleId) {
      setForm((f) => ({ ...f, vehicleId: defaultVehicleId }));
    }
  }, [open, defaultVehicleId]);

  const vehicleOptions = useMemo(
    () => vehicles.items.filter((v) => !v.archivedAt),
    [vehicles.items],
  );

  const selectedVehicle = vehicleOptions.find((v) => v.id === form.vehicleId);
  const createdVehicleLabel = useMemo(() => {
    if (!created?.vehicleId) return null;
    const v = vehicleOptions.find((item) => item.id === created.vehicleId);
    if (!v) return null;
    return `${v.plateNumber}${v.vehicleCode ? ` · ${v.vehicleCode}` : ''}`;
  }, [created?.vehicleId, vehicleOptions]);

  const validateDevice = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Enter a device name';
    else if (form.name.trim().length > 120) next.name = 'Name must be 120 characters or fewer';
    if (!form.externalId.trim()) next.externalId = 'Enter the GPS unit IMEI';
    else if (form.externalId.trim().length > 200) next.externalId = 'IMEI must be 200 characters or fewer';
    if (!form.provider) next.provider = 'Select a GPS provider';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const finishAndClose = (deviceId: string, opts?: { requireSecretAck?: boolean }) => {
    if (opts?.requireSecretAck && created?.ingestSecret && !secretSaved) {
      const proceed = window.confirm(
        'The connection secret is shown only once. Copy it before leaving, or you will need an admin to rotate a new secret later. Leave anyway?',
      );
      if (!proceed) return;
    }
    onOpenChange(false);
    onCreated?.(deviceId);
  };

  const handleRegister = async () => {
    if (!validateDevice()) {
      setStep(3);
      return;
    }
    try {
      const result = await create.mutateAsync({
        name: form.name.trim(),
        provider: form.provider,
        externalId: form.externalId.trim(),
        vehicleId: form.vehicleId || undefined,
      });
      toast.success('Device registered — copy the connection secret, then finish gateway setup');
      setCreated(result);
      setStep(4);
    } catch (err) {
      const message = describeError(err, 'Failed to register GPS device');
      if (/external id already exists/i.test(message)) {
        toast.error(
          'This IMEI is already registered for the selected provider. Open the existing device instead of creating a duplicate.',
        );
      } else {
        toast.error(message);
      }
    }
  };

  const handleCopySecret = async () => {
    if (!created?.ingestSecret) return;
    try {
      await navigator.clipboard.writeText(created.ingestSecret);
      setSecretCopied(true);
      setSecretSaved(true);
      toast.success('Connection secret copied');
      window.setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      toast.error('Could not copy secret');
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && created) {
      if (created.ingestSecret && !secretSaved && step === 4) {
        const proceed = window.confirm(
          'The connection secret is shown only once. Copy it before leaving, or you will need an admin to rotate a new secret later. Leave anyway?',
        );
        if (!proceed) return;
      }
      onCreated?.(created.id);
    }
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Connect GPS device</SheetTitle>
          <SheetDescription>
            Attach a GPS unit to a vehicle, set up the gateway, then wait for a real GPS signal.
            Registering a device is not the same as being connected.
          </SheetDescription>
        </SheetHeader>

        <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Setup steps">
          {STEPS.map((s) => {
            const reached = step >= s.id || (created != null && s.id <= 4);
            const current = step === s.id;
            return (
              <li
                key={s.id}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  current
                    ? 'bg-brand/15 text-brand'
                    : reached
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-muted/40 text-muted-foreground/70',
                )}
              >
                {s.id}. {s.label}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-1 flex-col gap-4">
          {step === 1 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="gps-vehicle">Connected vehicle</Label>
                <select
                  id="gps-vehicle"
                  value={form.vehicleId}
                  onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select a vehicle…</option>
                  {vehicleOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber}
                      {v.vehicleCode ? ` · ${v.vehicleCode}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Fleet Tracking shows positions per vehicle. You can attach later from device
                  edit, but selecting now is recommended.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Need a new vehicle first?{' '}
                <Link
                  to="/app/vehicles"
                  search={{ create: true }}
                  className="text-brand hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  Create vehicle
                </Link>
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="gps-provider">GPS provider</Label>
                <select
                  id="gps-provider"
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
                      {p === 'TRACCAR' ? ' (recommended)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                {providerSupportNote(form.provider)}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="gps-name">Device name</Label>
                <Input
                  id="gps-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={
                    selectedVehicle
                      ? `${selectedVehicle.plateNumber} GPS`
                      : 'Cab GPS unit'
                  }
                  maxLength={120}
                />
                {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gps-imei">IMEI</Label>
                <Input
                  id="gps-imei"
                  value={form.externalId}
                  onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
                  placeholder="15-digit IMEI from the GPS unit"
                  maxLength={200}
                  className="font-mono"
                />
                {errors.externalId ? (
                  <p className="text-xs text-destructive">{errors.externalId}</p>
                ) : null}
                {form.provider === 'TRACCAR' &&
                form.externalId.trim() &&
                !looksLikeImei(form.externalId) ? (
                  <p className="text-xs text-warning">
                    Traccar usually uses the 15-digit IMEI as the device identifier. Double-check
                    this matches your GPS unit.
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Provider:</span>{' '}
                  {providerLabel(form.provider)}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-foreground">Vehicle:</span>{' '}
                  {selectedVehicle
                    ? `${selectedVehicle.plateNumber}${selectedVehicle.vehicleCode ? ` · ${selectedVehicle.vehicleCode}` : ''}`
                    : 'Not attached yet'}
                </p>
                <p className="mt-2">
                  Provider and IMEI cannot be changed after registration. Name and vehicle can.
                </p>
              </div>
            </div>
          ) : null}

          {step === 4 && created ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Connection secret (shown once)</Label>
                <p className="text-xs text-muted-foreground">
                  Copy this now. It is required for gateway forwarding and will not be shown again.
                </p>
                {created.secretPrefix ? (
                  <p className="text-xs text-muted-foreground">
                    Prefix <span className="font-mono text-foreground">{created.secretPrefix}</span>
                  </p>
                ) : null}
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <code className="break-all font-mono text-xs">{created.ingestSecret}</code>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleCopySecret()}>
                  {secretCopied ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy secret
                    </>
                  )}
                </Button>
              </div>

              <GatewaySetupChecklist
                mode="onboarding"
                deviceId={created.id}
                provider={created.provider}
                imei={created.externalId}
                vehicleLabel={createdVehicleLabel}
                connectionStatus="WAITING_FOR_CONNECTION"
                isSuccessfullyConnected={false}
                ingestSecret={created.ingestSecret}
                secretPrefix={created.secretPrefix}
                onVerify={() => setStep(5)}
              />
            </div>
          ) : null}

          {step === 5 && created ? (
            <DeviceConnectionVerifyPanel deviceId={created.id} poll />
          ) : null}

          <div className="mt-auto flex flex-wrap gap-2 border-t border-border/60 pt-3">
            {step === 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="button" className="flex-1" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" className="flex-1" onClick={() => setStep(3)}>
                  Continue
                </Button>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={create.isPending}
                  onClick={() => void handleRegister()}
                >
                  {create.isPending ? 'Registering…' : 'Register device'}
                </Button>
              </>
            ) : null}

            {step === 4 && created ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => finishAndClose(created.id, { requireSecretAck: true })}
                >
                  Finish later
                </Button>
                <Button type="button" className="flex-1" onClick={() => setStep(5)}>
                  Verify connection
                </Button>
              </>
            ) : null}

            {step === 5 && created ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(4)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => finishAndClose(created.id)}
                >
                  Done
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
