"use client";

import { CheckCircle2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, getOnTimeDeliveryRate } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function ReportsSummary() {
  const { orders, expenses } = useAppData();

  const delivered = orders.filter((o) => o.status === "delivered");
  const totalRevenue = delivered.reduce((sum, o) => sum + o.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const onTimeRate = getOnTimeDeliveryRate(orders);

  const cards = [
    {
      label: "Total Revenue",
      value: formatCurrency(totalRevenue),
      sub: `${delivered.length} delivered orders`,
      icon: TrendingUp,
      tone: "text-chart-2 bg-chart-2/10",
    },
    {
      label: "Total Expenses",
      value: formatCurrency(totalExpenses),
      sub: `${expenses.length} expense entries`,
      icon: TrendingDown,
      tone: "text-chart-4 bg-chart-4/10",
    },
    {
      label: "Net Profit",
      value: formatCurrency(netProfit),
      sub: "revenue minus all expenses",
      icon: Wallet,
      tone: "text-primary bg-primary/10",
      subTone: netProfit >= 0 ? "text-chart-2" : "text-destructive",
    },
    {
      label: "On-Time Delivery",
      value: `${onTimeRate}%`,
      sub: "of delivered orders",
      icon: CheckCircle2,
      tone: "text-chart-5 bg-chart-5/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
