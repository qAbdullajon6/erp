'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ApiDispatch } from '@/lib/api/dispatches';
import { describeError } from '@/lib/api/describe-error';
import { useAvailability } from '@/lib/api/availability';
import { useUpdateDispatch } from '@/lib/hooks/use-dispatches';
import { useLiveDispatchConflictCheck } from '@/components/dispatch/use-live-dispatch-conflict-check';

/// Reassignment (PATCH /dispatches/:id — Task 8.7), shared by the two surfaces that
/// offer it (DispatchReassignDialog for list/board row actions, DispatchReassignSheet
/// for the detail page). Both used to hand-roll the same driver/vehicle state,
/// availability fetch, live conflict check and confirmation copy — a change to one
/// (e.g. Task 8.7's reassignment rules) was a change two files had to remember to make
/// identically. This hook is the one implementation; each caller only owns its own
/// dialog/sheet chrome.
///
/// The driver and vehicle lists come from the canonical availability endpoint
/// (Task 8.8), asked for THIS dispatch's scheduled window — the same window
/// AssignmentPolicy will check against. So neither surface can offer a resource the
/// API is about to refuse.
///
/// Note the dispatch's CURRENT driver will not appear in the list — they are busy
/// on this very dispatch. That is correct and intentional: you cannot reassign
/// somebody to the job they are already on.
export function formatReassignWindow(dispatch: ApiDispatch | null): string {
  if (!dispatch) return 'these dates';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const from = new Date(dispatch.pickupDateScheduled).toLocaleDateString('en-US', opts);
  const to = new Date(dispatch.deliveryDateScheduled).toLocaleDateString('en-US', opts);
  return `${from} – ${to}`;
}

export function useDispatchReassignForm(
  dispatch: ApiDispatch | null,
  active: boolean,
  onSuccess?: (dispatchId: string) => void,
) {
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState('');

  const { data: availability, loading: availabilityLoading, error: availabilityError } = useAvailability(
    dispatch && active
      ? { pickupDate: dispatch.pickupDateScheduled, deliveryDate: dispatch.deliveryDateScheduled }
      : undefined,
  );

  const { update, loading: saving } = useUpdateDispatch(dispatch?.id ?? '');
  const { check: liveCheck } = useLiveDispatchConflictCheck(dispatch?.id ?? '', Boolean(dispatch) && active);

  const reset = () => {
    setDriverId('');
    setVehicleId('');
    setError('');
  };

  const runLiveCheck = (nextDriver: string, nextVehicle: string) => {
    const input: { driverId?: string; vehicleId?: string } = {};
    if (nextDriver) input.driverId = nextDriver;
    if (nextVehicle) input.vehicleId = nextVehicle;
    liveCheck(input);
  };

  const selectDriver = (next: string) => {
    setDriverId(next);
    runLiveCheck(next, vehicleId);
  };

  const selectVehicle = (next: string) => {
    setVehicleId(next);
    runLiveCheck(driverId, next);
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

  const handleSave = async (): Promise<boolean> => {
    if (!dispatch) return false;
    if (!hasChoice) {
      setError('Choose a new driver or a new vehicle');
      return false;
    }
    try {
      await update({
        ...(driverId ? { driverId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
      });
      toast.success(`${dispatch.dispatchNumber} reassigned`);
      onSuccess?.(dispatch.id);
      reset();
      return true;
    } catch (err) {
      // The server's own words. An assignment conflict (409) explains itself.
      setError(describeError(err, 'Failed to reassign'));
      return false;
    }
  };

  return {
    driverId,
    vehicleId,
    error,
    availability,
    availabilityLoading,
    availabilityError,
    saving,
    hasChoice,
    noneFree,
    newDriver,
    newVehicle,
    confirmationText,
    selectDriver,
    selectVehicle,
    handleSave,
    reset,
  };
}
