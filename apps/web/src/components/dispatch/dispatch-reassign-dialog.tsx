'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { useAvailability } from '@/lib/api/availability';
import { useUpdateDispatch } from '@/lib/hooks/use-dispatches';
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

function formatWindow(dispatch: ApiDispatch | null): string {
  if (!dispatch) return 'these dates';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const from = new Date(dispatch.pickupDateScheduled).toLocaleDateString('en-US', opts);
  const to = new Date(dispatch.deliveryDateScheduled).toLocaleDateString('en-US', opts);
  return `${from} – ${to}`;
}

/// Reassignment (PATCH /dispatches/:id — Task 8.7).
///
/// The driver and vehicle lists come from the canonical availability endpoint
/// (Task 8.8), asked for THIS dispatch's scheduled window — the same window
/// AssignmentPolicy will check against. So the dialog cannot offer a resource the
/// API is about to refuse, and there is no availability logic here to go stale:
/// it reuses the 8.8 hook untouched.
///
/// Note the dispatch's CURRENT driver will not appear in the list — they are busy
/// on this very dispatch. That is correct and intentional: you cannot reassign
/// somebody to the job they are already on.

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

export function DispatchReassignDialog({ dispatch, onClose, onSuccess }: Props) {
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState('');

  const { data: availability, loading: availabilityLoading } = useAvailability(
    dispatch
      ? {
          pickupDate: dispatch.pickupDateScheduled,
          deliveryDate: dispatch.deliveryDateScheduled,
        }
      : undefined,
  );

  const { update, loading: saving } = useUpdateDispatch(dispatch?.id ?? '');

  const close = () => {
    setDriverId('');
    setVehicleId('');
    setError('');
    onClose();
  };

  const hasChoice = Boolean(driverId || vehicleId);
  const noneFree =
    (availability?.drivers.length ?? 0) === 0 && (availability?.vehicles.length ?? 0) === 0;

  const newDriver = availability?.drivers.find((d) => d.id === driverId);
  const newVehicle = availability?.vehicles.find((v) => v.id === vehicleId);

  /// Says exactly what is about to happen, in the terms the dispatcher cares about:
  /// who is being taken off, and who is going on.
  const confirmationText = [
    newDriver ? `${dispatch?.driver?.firstName ?? 'The current driver'} ${dispatch?.driver?.lastName ?? ''} is taken off this dispatch and ${newDriver.firstName} ${newDriver.lastName} takes it on.` : null,
    newVehicle ? `Vehicle ${dispatch?.vehicle?.plateNumber ?? '—'} is released and ${newVehicle.plateNumber} is committed.` : null,
    'The released driver and vehicle become available for other trips.',
  ]
    .filter(Boolean)
    .join(' ');

  const handleSave = async () => {
    if (!dispatch) return;
    if (!hasChoice) {
      setError('Choose a new driver or a new vehicle');
      return;
    }
    try {
      await update({
        ...(driverId ? { driverId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
      });
      toast.success(`${dispatch.dispatchNumber} reassigned`);
      onSuccess?.(dispatch.id);
      close();
    } catch (err) {
      // The server's own words. An assignment conflict (409) explains itself.
      setError(describeError(err, 'Failed to reassign'));
    }
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

        {/* The "nobody is free" case used to be readable only by opening the select.
            It is the single most important thing this dialog can tell you, so it is
            said out loud — and it explains WHY, which is that everyone else is on
            another trip in these same dates. */}
        {!availabilityLoading && noneFree ? (
          <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Nobody is free for {formatWindow(dispatch)}. Every other driver and vehicle is
            already committed to an overlapping trip.
          </div>
        ) : null}

        <div className="space-y-4">
          <FormField id="reassign-driver" label="New driver">
            <select
              id="reassign-driver"
              className={SELECT_CLASS}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={availabilityLoading}
            >
              <option value="">
                {availabilityLoading
                  ? 'Checking who is free...'
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
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={availabilityLoading}
            >
              <option value="">
                {availabilityLoading
                  ? 'Checking what is free...'
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
              it IS consequential for two people's day, so it is confirmed like one. */}
          <ConfirmDialog
            trigger={
              <Button disabled={saving || availabilityLoading || !hasChoice}>
                {saving ? 'Reassigning...' : 'Reassign'}
              </Button>
            }
            title={`Reassign ${dispatch?.dispatchNumber ?? ''}?`}
            description={confirmationText}
            confirmLabel="Yes, reassign"
            onConfirm={() => void handleSave()}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
