'use client';

import { useState } from 'react';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { FormAlert } from '@/components/shared/form-alert';
import { formatReassignWindow, useDispatchReassignForm } from './use-dispatch-reassign-form';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  dispatch: ApiDispatch | null;
  onClose: () => void;
  /// Fired after a successful reassign, in addition to onClose — lets a
  /// master-detail caller (Work Queue) fade the resolved item out and
  /// auto-select the next one, without this dialog knowing anything about
  /// queues.
  onSuccess?: (dispatchId: string) => void;
}

/// Quick reassign for list/board row actions. See use-dispatch-reassign-form.ts
/// for the shared logic (also used by DispatchReassignSheet on the detail page).
export function DispatchReassignDialog({ dispatch, onClose, onSuccess }: Props) {
  const active = Boolean(dispatch);
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
  } = useDispatchReassignForm(dispatch, active, onSuccess);

  const close = () => {
    reset();
    onClose();
  };

  const onConfirm = async () => {
    if (await handleSave()) close();
  };

  return (
    <Dialog open={Boolean(dispatch)} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent aria-describedby="reassign-description">
        <DialogHeader>
          <DialogTitle>Reassign {dispatch?.dispatchNumber}</DialogTitle>
          <DialogDescription id="reassign-description">
            Only drivers and vehicles that are free for this trip&apos;s dates are listed.
          </DialogDescription>
        </DialogHeader>

        {error ? <FormAlert message={error} /> : null}

        {availabilityError ? (
          <FormAlert message={availabilityError} />
        ) : null}

        {/* The "nobody is free" case used to be readable only by opening the select.
            It is the single most important thing this dialog can tell you, so it is
            said out loud — and it explains WHY, which is that everyone else is on
            another trip in these same dates. */}
        {!availabilityLoading && !availabilityError && noneFree ? (
          <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Nobody is free for {formatReassignWindow(dispatch)}. Every other driver and vehicle is
            already committed to an overlapping trip.
          </div>
        ) : null}

        <div className="space-y-4">
          <FormField id="reassign-driver" label="New driver">
            <select
              id="reassign-driver"
              className={SELECT_CLASS}
              value={driverId}
              onChange={(e) => selectDriver(e.target.value)}
              disabled={availabilityLoading || Boolean(availabilityError)}
            >
              <option value="">
                {availabilityLoading
                  ? 'Checking who is free...'
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
          </FormField>

          <FormField id="reassign-vehicle" label="New vehicle">
            <select
              id="reassign-vehicle"
              className={SELECT_CLASS}
              value={vehicleId}
              onChange={(e) => selectVehicle(e.target.value)}
              disabled={availabilityLoading || Boolean(availabilityError)}
            >
              <option value="">
                {availabilityLoading
                  ? 'Checking what is free...'
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
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          {/* Reassignment takes a driver off a job they have been given and hands it
              to somebody else. It is not destructive in the "data is gone" sense, but
              it IS consequential for two people's day, so it is confirmed like one.
              Controlled (not `trigger`): a Radix AlertDialogTrigger nested inside an
              already-open Dialog never opens — the outer Dialog's dismissable layer
              eats the click and closes itself instead. */}
          <Button
            disabled={saving || availabilityLoading || Boolean(availabilityError) || !hasChoice}
            onClick={() => setConfirmOpen(true)}
          >
            {saving ? 'Reassigning...' : 'Reassign'}
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`Reassign ${dispatch?.dispatchNumber ?? ''}?`}
            description={confirmationText}
            confirmLabel="Yes, reassign"
            onConfirm={() => {
              setConfirmOpen(false);
              void onConfirm();
            }}
            onCancel={() => setConfirmOpen(false)}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
