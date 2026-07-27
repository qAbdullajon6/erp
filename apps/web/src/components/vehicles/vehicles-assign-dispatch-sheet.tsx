'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { StatusBadge } from '@/components/shared/status-badge';
import { useCreateDispatch, useDispatchBoardSummary } from '@/lib/hooks/use-dispatches';
import { useAvailability } from '@/lib/api/availability';
import type { Vehicle } from '@/lib/api/vehicles';
import { describeError } from '@/lib/api/describe-error';
import { formatDate } from '@/lib/format';
import { Package, UserRound } from 'lucide-react';
import { toast } from 'sonner';

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle;
  onAssigned?: () => void;
}

/// Lock this vehicle; pick unassigned order + free driver via POST /dispatches.
export function VehiclesAssignDispatchSheet({ open, onOpenChange, vehicle, onAssigned }: Props) {
  const { create, loading } = useCreateDispatch();
  const { data: board, loading: boardLoading } = useDispatchBoardSummary();
  const [orderId, setOrderId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [error, setError] = useState('');

  const unassigned = board?.unassignedOrders ?? [];
  const selectedOrder = unassigned.find((o) => o.id === orderId) ?? null;

  const { data: availability, loading: availLoading, error: availError } = useAvailability(
    open && selectedOrder
      ? { pickupDate: selectedOrder.pickupDate, deliveryDate: selectedOrder.deliveryDate }
      : undefined,
  );

  useEffect(() => {
    if (!open) return;
    setOrderId('');
    setDriverId('');
    setError('');
  }, [open, vehicle.id]);

  useEffect(() => {
    setDriverId('');
  }, [orderId]);

  const drivers = availability?.drivers ?? [];
  const vehicleFree = useMemo(() => {
    if (!availability) return true;
    return availability.vehicles.some((v) => v.id === vehicle.id);
  }, [availability, vehicle.id]);

  const handleSave = async () => {
    if (!orderId) {
      setError('Choose an order');
      return;
    }
    if (!driverId) {
      setError('Choose a driver');
      return;
    }
    if (availability && !vehicleFree) {
      setError('This vehicle is not free for the order dates');
      return;
    }
    try {
      await create({ orderId, driverId, vehicleId: vehicle.id });
      toast.success(`Dispatch created for ${vehicle.plateNumber}`);
      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      setError(describeError(err, 'Failed to assign dispatch'));
    }
  };

  const blocked =
    Boolean(vehicle.archivedAt) ||
    vehicle.status === 'MAINTENANCE' ||
    vehicle.status === 'INACTIVE';

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Assign dispatch</SheetTitle>
          <SheetDescription className="text-xs">
            Create a dispatch for {vehicle.plateNumber} ({vehicle.vehicleCode}).
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 scrollbar-thin">
          {blocked ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Only available / in-use, non-archived vehicles can take new assignments. Update status or
              restore first.
            </div>
          ) : (
            <>
              {error ? <FormAlert message={error} /> : null}
              {availError ? <FormAlert message={availError} /> : null}

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Package className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">Unassigned order</h3>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="veh-order" className="text-xs text-muted-foreground">
                    Order
                  </Label>
                  <select
                    id="veh-order"
                    className={SELECT}
                    value={orderId}
                    disabled={boardLoading || loading}
                    onChange={(e) => setOrderId(e.target.value)}
                  >
                    <option value="">
                      {boardLoading ? 'Loading…' : unassigned.length === 0 ? 'No unassigned orders' : 'Select…'}
                    </option>
                    {unassigned.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} · {o.pickupCity} → {o.deliveryCity} · {formatDate(o.pickupDate)}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedOrder && (
                  <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={selectedOrder.status} />
                      <span className="text-muted-foreground">
                        {formatDate(selectedOrder.pickupDate)} → {formatDate(selectedOrder.deliveryDate)}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">Driver</h3>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="veh-driver" className="text-xs text-muted-foreground">
                    Free for this trip&apos;s dates
                  </Label>
                  <select
                    id="veh-driver"
                    className={SELECT}
                    value={driverId}
                    disabled={!orderId || availLoading || loading}
                    onChange={(e) => setDriverId(e.target.value)}
                  >
                    <option value="">
                      {!orderId
                        ? 'Select an order first'
                        : availLoading
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
                {orderId && availability && !vehicleFree && (
                  <p className="text-xs font-medium text-destructive">
                    This vehicle is busy for the selected dates.
                  </p>
                )}
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
            disabled={loading || blocked}
            onClick={() => void handleSave()}
          >
            {loading ? 'Assigning…' : 'Create dispatch'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
