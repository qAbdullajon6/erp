"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, isMaintenanceDueSoon } from "@/lib/mock-data";
import { vehicleStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

export function VehicleTable() {
  const { vehicles, drivers, orders } = useAppData();

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Current order</TableHead>
              <TableHead>Next maintenance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((v) => {
              const driver = drivers.find((d) => d.vehicleId === v.id);
              const currentOrder = orders.find(
                (o) =>
                  o.vehicleId === v.id &&
                  ["assigned", "picked_up", "in_transit"].includes(o.status),
              );
              const maintenanceSoon = isMaintenanceDueSoon(v.nextMaintenanceAt);
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.model}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.type} · {v.plate}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {v.capacityTons}t
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={vehicleStatusMeta[v.status].badgeClass}>
                      {vehicleStatusMeta[v.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {driver?.name ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {currentOrder?.id ?? "—"}
                  </TableCell>
                  <TableCell>
                    <p
                      className={
                        maintenanceSoon
                          ? "flex items-center gap-1 text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {maintenanceSoon && <AlertTriangle className="size-3" />}
                      {formatDate(v.nextMaintenanceAt)}
                    </p>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
