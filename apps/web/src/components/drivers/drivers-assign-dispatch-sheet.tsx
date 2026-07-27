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
import type { Driver } from '@/lib/api/drivers';
import { describeError } from '@/lib/api/describe-error';
import { formatDate } from '@/lib/format';
import { Package, Truck } from 'lucide-react';
import { toast } from 'sonner';

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver;
  onAssigned?: () => void;
}

/// Assign this driver to an unassigned order + free vehicle via POST /dispatches.
/// Driver is locked; order/vehicle come from board unassigned + availability window.
export function DriversAssignDispatchSheet({ open, onOpenChange, driver, onAssigned }: Props) {
  const { create, loading } = useCreateDispatch();
  const { data: board, loading: boardLoading } = useDispatchBoardSummary();
  const [orderId, setOrderId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
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
    setVehicleId('');
    setError('');
  }, [open, driver.id]);

  useEffect(() => {
    setVehicleId('');
  }, [orderId]);

  const vehicles = availability?.vehicles ?? [];
  const driverFree = useMemo(() => {
    if (!availability) return true;
    return availability.drivers.some((d) => d.id === driver.id);
  }, [availability, driver.id]);

  const handleSave = async () => {
    if (!orderId) {
      setError('Choose an order');
      return;
    }
    if (!vehicleId) {
      setError('Choose a vehicle');
      return;
    }
    if (availability && !driverFree) {
      setError('This driver is not free for the order dates');
      return;
    }
    try {
      await create({ orderId, driverId: driver.id, vehicleId });
      toast.success(`Dispatch created for ${driver.firstName}`);
      onAssigned?.();
      onOpenChange(false);
    } catch (err) {
      setError(describeError(err, 'Failed to assign dispatch'));
    }
  };

  const blocked =
    Boolean(driver.archivedAt) || driver.status !== 'ACTIVE';

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">Assign dispatch</SheetTitle>
          <SheetDescription className="text-xs">
            Create a dispatch for {driver.firstName} {driver.lastName} ({driver.employeeCode}).
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 scrollbar-thin">
          {blocked ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Only active, non-archived drivers can take new assignments. Update status or restore first.
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
                  <Label htmlFor="assign-order" className="text-xs text-muted-foreground">
                    Order
                  </Label>
                  <select
                    id="assign-order"
                    className={SELECT}
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    disabled={boardLoading}
                  >
                    <option value="">
                      {boardLoading
                        ? 'Loading unassigned…'
                        : unassigned.length === 0
                          ? 'No unassigned orders'
                          : 'Select order…'}
                    </option>
                    {unassigned.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} — {o.pickupCity} → {o.deliveryCity}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedOrder && (
                  <div className="rounded-lg border border-border/60 bg-muted/15 px-3.5 py-3 text-xs">
                    <p className="font-medium text-foreground">
                      {selectedOrder.pickupCity} → {selectedOrder.deliveryCity}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Pickup {formatDate(selectedOrder.pickupDate)} · Delivery{' '}
                      {formatDate(selectedOrder.deliveryDate)}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={selectedOrder.status} />
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Truck className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">Vehicle</h3>
                </div>
                {!selectedOrder ? (
                  <p className="text-sm text-muted-foreground">Select an order to see free vehicles.</p>
                ) : availability && !driverFree ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                    This driver is already committed on overlapping dates for this order.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="assign-vehicle" className="text-xs text-muted-foreground">
                      Available vehicle
                    </Label>
                    <select
                      id="assign-vehicle"
                      className={SELECT}
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      disabled={availLoading || Boolean(availError)}
                    >
                      <option value="">
                        {availLoading
                          ? 'Checking availability…'
                          : vehicles.length === 0
                            ? 'No free vehicles for these dates'
                            : 'Select vehicle…'}
                      </option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plateNumber} — {v.type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || blocked || !orderId || !vehicleId}
            >
              {loading ? 'Assigning…' : 'Assign dispatch'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
