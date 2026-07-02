"use client";

import { AlertTriangle, Package, Truck, UserCheck, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  getInvoiceRemaining,
  getInvoiceStatus,
  isOrderDelayed,
  isWithinLastDay,
  revenueTrend,
} from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function KpiCards() {
  const { orders, drivers, invoices } = useAppData();

  const todaysOrders = orders.filter((o) => isWithinLastDay(o.createdAt)).length;
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  const activeDeliveries = orders.filter((o) =>
    ["assigned", "picked_up", "in_transit"].includes(o.status),
  ).length;
  const delayedOrders = orders.filter(isOrderDelayed).length;

  const last7 = revenueTrend.slice(-7).reduce((s, p) => s + p.revenue, 0);
  const prev7 = revenueTrend.slice(-14, -7).reduce((s, p) => s + p.revenue, 0);
  const revenueChangePct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : 0;

  const pendingPayments = invoices
    .filter((i) => getInvoiceStatus(i) !== "paid")
    .reduce((s, i) => s + getInvoiceRemaining(i), 0);
  const overdueInvoices = invoices.filter((i) => getInvoiceStatus(i) === "overdue").length;

  const availableDrivers = drivers.filter((d) => d.status === "available").length;
  const onDeliveryDrivers = drivers.filter((d) => d.status === "on_delivery").length;

  const cards = [
    {
      label: "Today's Orders",
      value: todaysOrders.toString(),
      sub: `${pendingOrders} awaiting assignment`,
      icon: Package,
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Active Deliveries",
      value: activeDeliveries.toString(),
      sub: `${delayedOrders} delayed`,
      icon: Truck,
      tone: "text-chart-2 bg-chart-2/10",
      subTone: delayedOrders > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Revenue (14 days)",
      value: formatCurrency(last7),
      sub: `${revenueChangePct >= 0 ? "+" : ""}${revenueChangePct.toFixed(1)}% vs prior week`,
      icon: Wallet,
      tone: "text-chart-3 bg-chart-3/10",
      subTone: revenueChangePct >= 0 ? "text-chart-2" : "text-destructive",
    },
    {
      label: "Pending Payments",
      value: formatCurrency(pendingPayments),
      sub: `${overdueInvoices} overdue invoices`,
      icon: AlertTriangle,
      tone: "text-chart-4 bg-chart-4/10",
      subTone: overdueInvoices > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Available Drivers",
      value: `${availableDrivers} / ${drivers.length}`,
      sub: `${onDeliveryDrivers} on delivery`,
      icon: UserCheck,
      tone: "text-chart-5 bg-chart-5/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <div className={cn("flex size-8 items-center justify-center rounded-lg", c.tone)}>
                <c.icon className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{c.value}</div>
            <p className={cn("text-xs text-muted-foreground", c.subTone)}>{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
