"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { driverStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { DriverStatus } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DriverFleetStatus() {
  const { drivers, vehicles } = useAppData();
  const total = drivers.length;
  const byStatus = (status: DriverStatus) =>
    drivers.filter((d) => d.status === status).length;

  const summary: { status: DriverStatus; count: number }[] = [
    { status: "available", count: byStatus("available") },
    { status: "on_delivery", count: byStatus("on_delivery") },
    { status: "off_duty", count: byStatus("off_duty") },
  ];

  const onDeliveryDrivers = drivers.filter((d) => d.status === "on_delivery");

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Fleet Status</CardTitle>
        <CardDescription>{total} drivers total</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {summary.map((s) => (
            <div key={s.status} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{driverStatusMeta[s.status].label}</span>
                <span className="font-medium">{s.count}</span>
              </div>
              <Progress value={(s.count / total) * 100} className="h-1.5" />
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Currently on delivery</p>
          {onDeliveryDrivers.map((d) => {
            const vehicle = vehicles.find((v) => v.id === d.vehicleId);
            return (
              <div key={d.id} className="flex items-center gap-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">{initials(d.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {vehicle?.model} · {vehicle?.plate}
                  </p>
                </div>
                <Badge variant="outline" className={driverStatusMeta[d.status].badgeClass}>
                  {driverStatusMeta[d.status].label}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
