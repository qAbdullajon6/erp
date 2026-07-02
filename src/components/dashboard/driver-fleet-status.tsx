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
import { drivers, getVehicle } from "@/lib/mock-data";
import type { DriverStatus } from "@/lib/types";

const statusMeta: Record<DriverStatus, { label: string; badgeClass: string }> = {
  available: { label: "Available", badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
  on_delivery: { label: "On Delivery", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  off_duty: { label: "Off Duty", badgeClass: "bg-muted text-muted-foreground border-transparent" },
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DriverFleetStatus() {
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
                <span className="text-muted-foreground">{statusMeta[s.status].label}</span>
                <span className="font-medium">{s.count}</span>
              </div>
              <Progress value={(s.count / total) * 100} className="h-1.5" />
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Currently on delivery</p>
          {onDeliveryDrivers.map((d) => {
            const vehicle = getVehicle(d.vehicleId);
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
                <Badge variant="outline" className={statusMeta[d.status].badgeClass}>
                  {statusMeta[d.status].label}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
