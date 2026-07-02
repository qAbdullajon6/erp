"use client";

import * as React from "react";
import { ArrowRight, PackageSearch } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatCurrency, formatDate, getCustomer } from "@/lib/mock-data";
import { driverStatusMeta, vehicleStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Order } from "@/lib/types";
import { AssignDialog } from "@/components/dispatch/assign-dialog";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DispatchBoard() {
  const { orders, drivers, vehicles } = useAppData();
  const [assigning, setAssigning] = React.useState<Order | null>(null);

  const unassigned = orders
    .filter((o) => o.status === "pending")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const busyOrderByDriver = new Map(
    orders
      .filter((o) => ["assigned", "picked_up", "in_transit"].includes(o.status))
      .map((o) => [o.driverId, o]),
  );

  const availableDrivers = drivers.filter((d) => d.status === "available");
  const busyDrivers = drivers.filter((d) => d.status === "on_delivery");
  const offDutyDrivers = drivers.filter((d) => d.status === "off_duty");

  const availableVehicles = vehicles.filter((v) => v.status === "available");
  const busyVehicles = vehicles.filter((v) => v.status === "on_delivery");
  const otherVehicles = vehicles.filter(
    (v) => v.status === "maintenance" || v.status === "inactive",
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="size-4" />
            Unassigned Orders
          </CardTitle>
          <CardDescription>{unassigned.length} waiting for a driver</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unassigned.length === 0 && (
            <p className="text-sm text-muted-foreground">All orders are assigned.</p>
          )}
          {unassigned.map((order) => {
            const customer = getCustomer(order.customerId);
            return (
              <div key={order.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{order.id}</span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatCurrency(order.amount)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{customer?.name}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  {order.origin} <ArrowRight className="size-3" /> {order.destination}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.cargo} · {order.weightTons}t · pickup {formatDate(order.pickupDate)}
                </p>
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setAssigning(order)}
                >
                  Assign
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Drivers</CardTitle>
          <CardDescription>
            {availableDrivers.length} available · {busyDrivers.length} on delivery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Available</p>
            {availableDrivers.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">{initials(d.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {d.onTimeRate}% on-time · {d.completedDeliveries} deliveries
                  </p>
                </div>
                <Badge variant="outline" className={driverStatusMeta.available.badgeClass}>
                  Available
                </Badge>
              </div>
            ))}
            {availableDrivers.length === 0 && (
              <p className="text-xs text-muted-foreground">None free right now.</p>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">On delivery</p>
            {busyDrivers.map((d) => {
              const currentOrder = busyOrderByDriver.get(d.id);
              return (
                <div key={d.id} className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[10px]">{initials(d.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{d.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {currentOrder ? currentOrder.id : "—"}
                    </p>
                  </div>
                  <Badge variant="outline" className={driverStatusMeta.on_delivery.badgeClass}>
                    On Delivery
                  </Badge>
                </div>
              );
            })}
          </div>

          {offDutyDrivers.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Off duty</p>
              {offDutyDrivers.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[10px]">{initials(d.name)}</AvatarFallback>
                  </Avatar>
                  <p className="truncate text-xs font-medium">{d.name}</p>
                  <Badge
                    variant="outline"
                    className={`ml-auto ${driverStatusMeta.off_duty.badgeClass}`}
                  >
                    Off Duty
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
          <CardDescription>
            {availableVehicles.length} available · {busyVehicles.length} on delivery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Available</p>
            {availableVehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {v.model} · {v.plate}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{v.capacityTons}t capacity</p>
                </div>
                <Badge variant="outline" className={vehicleStatusMeta.available.badgeClass}>
                  Available
                </Badge>
              </div>
            ))}
            {availableVehicles.length === 0 && (
              <p className="text-xs text-muted-foreground">None free right now.</p>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">On delivery</p>
            {busyVehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {v.model} · {v.plate}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{v.capacityTons}t capacity</p>
                </div>
                <Badge variant="outline" className={vehicleStatusMeta.on_delivery.badgeClass}>
                  On Delivery
                </Badge>
              </div>
            ))}
          </div>

          {otherVehicles.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Unavailable</p>
              {otherVehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between">
                  <p className="truncate text-xs font-medium">
                    {v.model} · {v.plate}
                  </p>
                  <Badge variant="outline" className={vehicleStatusMeta[v.status].badgeClass}>
                    {vehicleStatusMeta[v.status].label}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {assigning && (
        <AssignDialog
          key={assigning.id}
          order={assigning}
          onOpenChange={(open) => {
            if (!open) setAssigning(null);
          }}
        />
      )}
    </div>
  );
}
