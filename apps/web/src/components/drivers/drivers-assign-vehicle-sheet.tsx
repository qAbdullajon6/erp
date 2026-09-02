'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { FormAlert } from '@/components/shared/form-alert';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useUpdateDispatch } from '@/lib/hooks/use-dispatches';
import { useAvailability } from '@/lib/api/availability';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { Driver } from '@/lib/api/drivers';
import { describeError } from '@/lib/api/describe-error';
import { Truck } from 'lucide-react';
import { toast } from 'sonner';

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver;
  /// Live dispatch for this driver — required to change vehicle (PATCH reassignment).
  liveDispatch: ApiDispatch | null;
  onAssigned?: () => void;
}

/// Reassign vehicle on the driver's live dispatch via PATCH /dispatches/:id.
export function DriversAssignVehicleSheet({
  open,
  onOpenChange,
  driver,
  liveDispatch,
  onAssigned,
}: Props) {
  const { update, loading } = useUpdateDispatch(liveDispatch?.id ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: availability, loading: availLoading, error: availError } = useAvailability(
    open && liveDispatch
      ? {
          pickupDate: liveDispatch.pickupDateScheduled,
          deliveryDate: liveDispatch.deliveryDateScheduled,
        }
      : undefined,
  );

  useEffect(() => {
    if (!open) return;
    setVehicleId('');
    setError('');
  }, [open, liveDispatch?.id]);

  const vehicles = availability?.vehicles ?? [];
  const picked = vehicles.find((v) => v.id === vehicleId);

  const handleSave = async () => {
    if (!liveDispatch) return;
    if (!vehicleId) {
      setError('Choose a vehicle');
      return;
    }
    try {
      await update({ vehicleId });
      toast.success(`${liveDispatch.dispatchNumber} → ${picked?.plateNumber ?? 'new vehicle'}`);
      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      setError(describeError(err, 'Failed to assign vehicle'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Assign vehicle</SheetTitle>
          <SheetDescription className="text-xs">
            {driver.firstName} {driver.lastName}
            {liveDispatch ? ` · ${liveDispatch.dispatchNumber}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 scrollbar-thin">
          {!liveDispatch ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No live dispatch for this driver. Assign a dispatch first, then choose a vehicle.
            </div>
          ) : (
            <>
              {error ? <FormAlert message={error} /> : null}
              {availError ? <FormAlert message={availError} /> : null}

              <div className="rounded-lg border border-border/60 bg-muted/15 px-3.5 py-3 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Current vehicle
                </p>
                <p className="mt-1 font-mono font-medium">
                  {liveDispatch.vehicle?.plateNumber ?? '—'}
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Truck className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">New vehicle</h3>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reassign-vehicle" className="text-xs text-muted-foreground">
                    Free for this trip&apos;s dates
                  </Label>
                  <select
                    id="reassign-vehicle"
                    className={SELECT}
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    disabled={availLoading || Boolean(availError)}
                  >
                    <option value="">
                      {availLoading
                        ? 'Checking availability…'
                        : vehicles.length === 0
                          ? 'No other vehicle is free'
                          : 'Select vehicle…'}
                    </option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} — {v.type}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            {liveDispatch ? (
              <>
                {/* Controlled (not `trigger`): a Radix AlertDialogTrigger nested inside an
                    already-open Sheet never opens — the outer Sheet's dismissable layer
                    eats the click and closes itself instead. */}
                <Button
                  disabled={loading || availLoading || !vehicleId}
                  onClick={() => setConfirmOpen(true)}
                >
                  {loading ? 'Assigning…' : 'Assign vehicle'}
                </Button>
                <ConfirmDialog
                  open={confirmOpen}
                  onOpenChange={setConfirmOpen}
                  title="Change vehicle?"
                  description={
                    picked
                      ? `Release ${liveDispatch.vehicle?.plateNumber ?? 'current'} and commit ${picked.plateNumber}.`
                      : 'Confirm vehicle change.'
                  }
                  confirmLabel="Yes, assign"
                  onConfirm={() => {
                    setConfirmOpen(false);
                    void handleSave();
                  }}
                  onCancel={() => setConfirmOpen(false)}
                />
              </>
            ) : (
              <Button disabled>Assign vehicle</Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
