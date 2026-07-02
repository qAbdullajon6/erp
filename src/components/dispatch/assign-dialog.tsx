"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCustomer } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";
import type { Order } from "@/lib/types";

export function AssignDialog({
  order,
  onOpenChange,
}: {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { drivers, vehicles, customers, assignOrder } = useAppData();
  const [driverId, setDriverId] = React.useState<string>("");
  const [vehicleId, setVehicleId] = React.useState<string>("");

  if (!order) return null;

  const customer = getCustomer(order.customerId, customers);
  const availableDrivers = drivers.filter((d) => d.status === "available");
  const availableVehicles = vehicles.filter((v) => v.status === "available");
  const selectedVehicle = availableVehicles.find((v) => v.id === vehicleId);
  const insufficientCapacity = selectedVehicle
    ? selectedVehicle.capacityTons < order.weightTons
    : false;

  function handleConfirm() {
    if (!driverId || !vehicleId || insufficientCapacity) return;
    assignOrder(order!.id, driverId, vehicleId);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign {order.id}</DialogTitle>
          <DialogDescription>
            {customer?.name} · {order.origin} → {order.destination} · {order.weightTons}t cargo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an available driver" />
              </SelectTrigger>
              <SelectContent>
                {availableDrivers.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No drivers available
                  </div>
                )}
                {availableDrivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} · {d.onTimeRate}% on-time
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an available vehicle" />
              </SelectTrigger>
              <SelectContent>
                {availableVehicles.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No vehicles available
                  </div>
                )}
                {availableVehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.model} ({v.plate}) · {v.capacityTons}t capacity
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {insufficientCapacity && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                Vehicle capacity ({selectedVehicle?.capacityTons}t) is below cargo weight (
                {order.weightTons}t).
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!driverId || !vehicleId || insufficientCapacity}
          >
            Confirm Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
