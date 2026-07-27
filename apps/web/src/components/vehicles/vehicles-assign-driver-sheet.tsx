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
import { useUpdateDispatch } from '@/lib/hooks/use-dispatches';
import { useAvailability } from '@/lib/api/availability';
import type { ApiDispatch } from '@/lib/api/dispatches';
import type { Vehicle } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { UserRound } from 'lucide-react';
import { toast } from 'sonner';

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  liveDispatch: ApiDispatch | null;
  onAssigned?: () => void;
}

/// Reassign driver on this vehicle's live dispatch via PATCH /dispatches/:id.
export function VehiclesAssignDriverSheet({
  open,
  onOpenChange,
  vehicle,
  liveDispatch,
  onAssigned,
}: Props) {
  const { update, loading } = useUpdateDispatch(liveDispatch?.id ?? '');
  const [driverId, setDriverId] = useState('');
  const [error, setError] = useState('');

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
    setDriverId('');
    setError('');
  }, [open, liveDispatch?.id]);

  const drivers = availability?.drivers ?? [];
  const picked = drivers.find((d) => d.id === driverId);

  const handleSave = async () => {
    if (!liveDispatch) return;
    if (!driverId) {
      setError('Choose a driver');
      return;
    }
    try {
      await update({ driverId });
      toast.success(
        `${liveDispatch.dispatchNumber} → ${picked ? `${picked.firstName} ${picked.lastName}` : 'new driver'}`,
      );
      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      setError(describeError(err, 'Failed to assign driver'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Assign driver</SheetTitle>
          <SheetDescription className="text-xs">
            {vehicle.plateNumber}
            {liveDispatch ? ` · ${liveDispatch.dispatchNumber}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 scrollbar-thin">
          {!liveDispatch ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No live dispatch for this vehicle. Assign a dispatch first, then choose a driver.
            </div>
          ) : (
            <>
              {error ? <FormAlert message={error} /> : null}
              {availError ? <FormAlert message={availError} /> : null}

              <div className="rounded-lg border border-border/60 bg-muted/15 px-3.5 py-3 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Current driver
                </p>
                <p className="mt-1 font-medium">
                  {liveDispatch.driver
                    ? `${liveDispatch.driver.firstName} ${liveDispatch.driver.lastName}`
                    : '—'}
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">New driver</h3>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reassign-driver" className="text-xs text-muted-foreground">
                    Free for this trip&apos;s dates
                  </Label>
                  <select
                    id="reassign-driver"
                    className={SELECT}
                    value={driverId}
                    disabled={availLoading || loading}
                    onChange={(e) => setDriverId(e.target.value)}
                  >
                    <option value="">
                      {availLoading
                        ? 'Checking availability…'
                        : drivers.length === 0
                          ? 'No free drivers'
                          : 'Select…'}
                    </option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.firstName} {d.lastName} · {d.employeeCode}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-brand text-brand-foreground hover:opacity-90"
            disabled={loading || !liveDispatch}
            onClick={() => void handleSave()}
          >
            {loading ? 'Saving…' : 'Assign driver'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
