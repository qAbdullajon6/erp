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
  useUpdateTelematicsDeviceMutation,
  type TelematicsDevice,
} from '@/lib/api/telematics-devices';
import { useVehiclesList } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { toast } from 'sonner';

interface Props {
  device: TelematicsDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DevicesEditSheet({ device, open, onOpenChange }: Props) {
  const update = useUpdateTelematicsDeviceMutation();
  const vehicles = useVehiclesList(
    { page: 1, limit: 100, includeArchived: false, sortBy: 'plateNumber', sortOrder: 'asc' },
    { enabled: open },
  );
  const [name, setName] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [active, setActive] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!device || !open) return;
    setName(device.name);
    setVehicleId(device.vehicleId ?? '');
    setActive(device.active);
    setNameError(null);
  }, [device, open]);

  const vehicleOptions = useMemo(
    () => vehicles.items.filter((v) => !v.archivedAt),
    [vehicles.items],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Required');
      return;
    }
    if (trimmed.length > 120) {
      setNameError('Max 120 characters');
      return;
    }
    setNameError(null);
    try {
      await update.mutateAsync({
        id: device.id,
        input: {
          name: trimmed,
          vehicleId: vehicleId || null,
          active,
        },
      });
      toast.success('Device updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update device'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit device</SheetTitle>
          <SheetDescription>
            Update name, vehicle binding, and active flag. Provider and external ID are fixed.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 flex flex-1 flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-device-name">Name</Label>
            <Input
              id="edit-device-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
            {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-device-vehicle">Connected vehicle</Label>
            <select
              id="edit-device-vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Active (accepts ingest)
          </label>

          <div className="mt-auto flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={update.isPending || !device}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
