"use client";

import { AlertTriangle, Star } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatDate,
  getDriverDelayCount,
  getDriverExpenseTotal,
  isLicenseExpiringSoon,
} from "@/lib/mock-data";
import { driverStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DriverTable() {
  const { drivers, vehicles, orders, expenses } = useAppData();

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead className="text-right">Deliveries</TableHead>
              <TableHead className="text-right">On-time</TableHead>
              <TableHead className="text-right">Delays</TableHead>
              <TableHead className="text-right">Total expenses</TableHead>
              <TableHead className="text-right">Rating</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((d) => {
              const vehicle = vehicles.find((v) => v.id === d.vehicleId);
              const expiringSoon = isLicenseExpiringSoon(d.licenseExpiresAt);
              const delayCount = getDriverDelayCount(d.id, orders);
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{initials(d.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.phone}</p>
                        {d.notes && (
                          <p className="text-xs text-muted-foreground italic">{d.notes}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{d.licenseNumber}</p>
                    <p
                      className={
                        expiringSoon
                          ? "flex items-center gap-1 text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {expiringSoon && <AlertTriangle className="size-3" />}
                      Expires {formatDate(d.licenseExpiresAt)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={driverStatusMeta[d.status].badgeClass}>
                      {driverStatusMeta[d.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle ? `${vehicle.model} · ${vehicle.plate}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{d.completedDeliveries}</TableCell>
                  <TableCell className="text-right">{d.onTimeRate}%</TableCell>
                  <TableCell
                    className={
                      delayCount > 0
                        ? "text-right text-destructive"
                        : "text-right text-muted-foreground"
                    }
                  >
                    {delayCount}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(getDriverExpenseTotal(d.id, expenses))}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3.5 fill-chart-3 text-chart-3" />
                      {d.rating.toFixed(1)}
                    </span>
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
