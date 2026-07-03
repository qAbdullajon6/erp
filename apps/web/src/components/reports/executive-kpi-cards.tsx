"use client";

import {
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  PiggyBank,
  Percent,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/mock-data";
import { percentChange } from "@/lib/date-range";
import type { ExecutiveStats } from "@/lib/reports-data";

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const change = percentChange(current, previous);
  if (change === null) {
    return <span className="text-xs text-muted-foreground">no prior data</span>;
  }
  const isFlat = Math.abs(change) < 0.05;
  const Icon = isFlat ? Minus : change > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        isFlat ? "text-muted-foreground" : change > 0 ? "text-chart-2" : "text-destructive",
      )}
    >
      <Icon className="size-3" />
      {change > 0 ? "+" : ""}
      {change.toFixed(1)}% vs prior period
    </span>
  );
}

export function ExecutiveKpiCards({
  current,
  previous,
}: {
  current: ExecutiveStats;
  previous: ExecutiveStats;
}) {
  const cards = [
    {
      label: "Total Orders",
      value: String(current.totalOrders),
      icon: Package,
      tone: "text-primary bg-primary/10",
      change: <ChangeIndicator current={current.totalOrders} previous={previous.totalOrders} />,
    },
    {
      label: "Delivered Orders",
      value: String(current.deliveredOrders),
      icon: CheckCircle2,
      tone: "text-chart-2 bg-chart-2/10",
      change: (
        <ChangeIndicator current={current.deliveredOrders} previous={previous.deliveredOrders} />
      ),
    },
    {
      label: "On-Time Delivery Rate",
      value: `${current.onTimeRatePercent}%`,
      icon: Percent,
      tone: "text-chart-5 bg-chart-5/10",
      change: (
        <ChangeIndicator current={current.onTimeRatePercent} previous={previous.onTimeRatePercent} />
      ),
    },
    {
      label: "Delayed Deliveries",
      value: String(current.delayedDeliveries),
      icon: AlertTriangle,
      tone: "text-destructive bg-destructive/10",
      change: (
        <ChangeIndicator current={current.delayedDeliveries} previous={previous.delayedDeliveries} />
      ),
    },
    {
      label: "Revenue",
      value: formatCurrency(current.revenue),
      icon: TrendingUp,
      tone: "text-chart-2 bg-chart-2/10",
      change: <ChangeIndicator current={current.revenue} previous={previous.revenue} />,
    },
    {
      label: "Collected Payments",
      value: formatCurrency(current.collectedPayments),
      icon: Wallet,
      tone: "text-chart-2 bg-chart-2/10",
      change: (
        <ChangeIndicator current={current.collectedPayments} previous={previous.collectedPayments} />
      ),
    },
    {
      label: "Outstanding Receivables",
      value: formatCurrency(current.outstandingReceivables),
      icon: Wallet,
      tone: "text-chart-3 bg-chart-3/10",
      change: null,
    },
    {
      label: "Approved Expenses",
      value: formatCurrency(current.approvedExpenses),
      icon: TrendingDown,
      tone: "text-chart-4 bg-chart-4/10",
      change: (
        <ChangeIndicator current={current.approvedExpenses} previous={previous.approvedExpenses} />
      ),
    },
    {
      label: "Est. Gross Profit",
      value: formatCurrency(current.grossProfit),
      icon: PiggyBank,
      tone: "text-primary bg-primary/10",
      change: <ChangeIndicator current={current.grossProfit} previous={previous.grossProfit} />,
    },
    {
      label: "Gross Margin %",
      value: `${current.grossMarginPercent.toFixed(1)}%`,
      icon: Percent,
      tone: "text-chart-5 bg-chart-5/10",
      change: (
        <ChangeIndicator
          current={current.grossMarginPercent}
          previous={previous.grossMarginPercent}
        />
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <div className={cn("flex size-7 items-center justify-center rounded-lg", c.tone)}>
                <c.icon className="size-3.5" />
              </div>
            </div>
            <div className="text-xl font-semibold tracking-tight">{c.value}</div>
            {c.change ?? <span className="text-xs text-muted-foreground">current balance</span>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
