import { AlertTriangle, Package, Truck, UserCheck, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  drivers,
  formatCurrency,
  invoices,
  orders,
  revenueTrend,
} from "@/lib/mock-data";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function computeKpis() {
  const now = Date.now();

  const todaysOrders = orders.filter(
    (o) => now - new Date(o.createdAt).getTime() < ONE_DAY_MS,
  ).length;
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  const activeDeliveries = orders.filter(
    (o) => o.status === "in_transit" || o.status === "assigned",
  ).length;
  const delayedOrders = orders.filter((o) => o.status === "delayed").length;

  const last7 = revenueTrend.slice(-7).reduce((s, p) => s + p.revenue, 0);
  const prev7 = revenueTrend.slice(-14, -7).reduce((s, p) => s + p.revenue, 0);
  const revenueChangePct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : 0;

  const pendingPayments = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((s, i) => s + i.amount, 0);
  const overdueInvoices = invoices.filter((i) => i.status === "overdue").length;

  const availableDrivers = drivers.filter((d) => d.status === "available").length;
  const onDeliveryDrivers = drivers.filter((d) => d.status === "on_delivery").length;

  return {
    todaysOrders,
    pendingOrders,
    activeDeliveries,
    delayedOrders,
    last7,
    revenueChangePct,
    pendingPayments,
    overdueInvoices,
    availableDrivers,
    onDeliveryDrivers,
    totalDrivers: drivers.length,
  };
}

export function KpiCards() {
  const k = computeKpis();

  const cards = [
    {
      label: "Today's Orders",
      value: k.todaysOrders.toString(),
      sub: `${k.pendingOrders} awaiting assignment`,
      icon: Package,
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Active Deliveries",
      value: k.activeDeliveries.toString(),
      sub: `${k.delayedOrders} delayed`,
      icon: Truck,
      tone: "text-chart-2 bg-chart-2/10",
      subTone: k.delayedOrders > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Revenue (14 days)",
      value: formatCurrency(k.last7),
      sub: `${k.revenueChangePct >= 0 ? "+" : ""}${k.revenueChangePct.toFixed(1)}% vs prior week`,
      icon: Wallet,
      tone: "text-chart-3 bg-chart-3/10",
      subTone: k.revenueChangePct >= 0 ? "text-chart-2" : "text-destructive",
    },
    {
      label: "Pending Payments",
      value: formatCurrency(k.pendingPayments),
      sub: `${k.overdueInvoices} overdue invoices`,
      icon: AlertTriangle,
      tone: "text-chart-4 bg-chart-4/10",
      subTone: k.overdueInvoices > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Available Drivers",
      value: `${k.availableDrivers} / ${k.totalDrivers}`,
      sub: `${k.onDeliveryDrivers} on delivery`,
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
