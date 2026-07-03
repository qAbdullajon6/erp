"use client";

import Link from "next/link";
import { ArrowUpRight, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOnTimeDeliveryRate, isOrderDelayed } from "@/lib/mock-data";
import { DEMO_DRIVER_ID, roleMeta } from "@/lib/role";
import { useAppData } from "@/lib/store";

const ACTIVE_STATUSES = ["assigned", "picked_up", "in_transit"] as const;

export function DriverDashboardSummary() {
  const { orders } = useAppData();
  const myOrders = orders.filter((o) => o.driverId === DEMO_DRIVER_ID);
  const active = myOrders.filter((o) => ACTIVE_STATUSES.includes(o.status as (typeof ACTIVE_STATUSES)[number]));
  const delayed = active.filter(isOrderDelayed);
  const delivered = myOrders.filter((o) => o.status === "delivered");
  const onTimeRate = getOnTimeDeliveryRate(myOrders);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Welcome back, {roleMeta.driver.personName}</h2>
        <p className="text-sm text-muted-foreground">Here&apos;s a quick look at your deliveries today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Deliveries</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{active.length}</div>
            <p className={delayed.length > 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {delayed.length > 0 ? `${delayed.length} delayed` : "All on schedule"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Completed Deliveries</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2">
                <Package className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{delivered.length}</div>
            <p className="text-xs text-muted-foreground">All-time on this account</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">On-Time Rate</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-chart-5/10 text-chart-5">
                <ArrowUpRight className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{onTimeRate}%</div>
            <p className="text-xs text-muted-foreground">Across your delivered orders</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">View your full delivery list</p>
            <p className="text-sm text-muted-foreground">
              Route, cargo, schedule and status updates for each assigned delivery.
            </p>
          </div>
          <Button asChild>
            <Link href="/my-deliveries">Open My Deliveries</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
