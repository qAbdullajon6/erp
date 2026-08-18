'use client';

import { useEffect, useState } from 'react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormAlert } from '@/components/shared/form-alert';
import { Truck, User } from 'lucide-react';
import { formatReassignWindow, useDispatchReassignForm } from './use-dispatch-reassign-form';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: ApiDispatch;
  onSuccess?: (dispatchId: string) => void;
}

/// Reassign driver / vehicle via Sheet — the detail page's counterpart to
/// DispatchReassignDialog. See use-dispatch-reassign-form.ts for the shared logic.
export function DispatchReassignSheet({ open, onOpenChange, dispatch, onSuccess }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const {
    driverId,
    vehicleId,
    error,
    availability,
    availabilityLoading,
    availabilityError,
    saving,
    hasChoice,
    noneFree,
    confirmationText,
    selectDriver,
    selectVehicle,
    handleSave,
    reset,
  } = useDispatchReassignForm(dispatch, open, onSuccess);

  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dispatch.id]);

  const onConfirm = async () => {
    if (await handleSave()) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Reassign {dispatch.dispatchNumber}</SheetTitle>
          <SheetDescription className="text-xs">
            Only drivers and vehicles free for {formatReassignWindow(dispatch)} are listed.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="h-3 w-3" />
                Current driver
              </p>
              <p className="mt-1 text-sm font-medium">
                {dispatch.driver
                  ? `${dispatch.driver.firstName} ${dispatch.driver.lastName}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Truck className="h-3 w-3" />
                Current vehicle
              </p>
              <p className="mt-1 font-mono text-sm font-medium">
                {dispatch.vehicle?.plateNumber ?? '—'}
              </p>
            </div>
          </div>

          {error ? (
            <div className="mb-4">
              <FormAlert message={error} />
            </div>
          ) : null}
          {availabilityError ? (
            <div className="mb-4">
              <FormAlert message={availabilityError} />
            </div>
          ) : null}

          {!availabilityLoading && !availabilityError && noneFree ? (
            <div className="mb-4 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Nobody is free for {formatReassignWindow(dispatch)}. Every other driver and vehicle is already
              committed to an overlapping trip.
            </div>
          ) : null}

          <div className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <User className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold">New driver</h3>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reassign-sheet-driver" className="text-xs font-medium text-muted-foreground">
                  Driver
                </Label>
                <select
                  id="reassign-sheet-driver"
                  className={SELECT_CLASS}
                  value={driverId}
                  onChange={(e) => selectDriver(e.target.value)}
                  disabled={availabilityLoading || Boolean(availabilityError)}
                >
                  <option value="">
                    {availabilityLoading
                      ? 'Checking who is free…'
                      : availabilityError
                        ? 'Availability unavailable'
                        : (availability?.drivers.length ?? 0) === 0
                          ? 'No other driver is free for these dates'
                          : 'Keep current driver'}
                  </option>
                  {availability?.drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.firstName} {driver.lastName} ({driver.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <Truck className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold">New vehicle</h3>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reassign-sheet-vehicle" className="text-xs font-medium text-muted-foreground">
                  Vehicle
                </Label>
                <select
                  id="reassign-sheet-vehicle"
                  className={SELECT_CLASS}
                  value={vehicleId}
                  onChange={(e) => selectVehicle(e.target.value)}
                  disabled={availabilityLoading || Boolean(availabilityError)}
                >
                  <option value="">
                    {availabilityLoading
                      ? 'Checking what is free…'
                      : availabilityError
                        ? 'Availability unavailable'
                        : (availability?.vehicles.length ?? 0) === 0
                          ? 'No other vehicle is free for these dates'
                          : 'Keep current vehicle'}
                  </option>
                  {availability?.vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plateNumber} — {vehicle.type}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            {/* Controlled (not `trigger`): a Radix AlertDialogTrigger nested inside an
                already-open Sheet never opens — the outer Sheet's dismissable layer
                eats the click and closes itself instead. */}
            <Button
              disabled={saving || availabilityLoading || Boolean(availabilityError) || !hasChoice}
              onClick={() => setConfirmOpen(true)}
            >
              {saving ? 'Reassigning…' : 'Reassign'}
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title={`Reassign ${dispatch.dispatchNumber}?`}
              description={confirmationText}
              confirmLabel="Yes, reassign"
              onConfirm={() => {
                setConfirmOpen(false);
                void onConfirm();
              }}
              onCancel={() => setConfirmOpen(false)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
