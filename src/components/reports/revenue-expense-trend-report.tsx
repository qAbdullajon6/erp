"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildTimeBuckets, isWithinRange, type DateBounds } from "@/lib/date-range";
import type { Order } from "@/lib/types";

export function RevenueExpenseTrendReport({
  orders,
  approvedExpenseDates,
  bounds,
}: {
  orders: Order[];
  approvedExpenseDates: { date: string; amount: number }[];
  bounds: DateBounds;
}) {
  const buckets = buildTimeBuckets(bounds);
  const delivered = orders.filter((o) => o.status === "delivered");

  const data = buckets.map((bucket) => ({
    label: bucket.label,
    Revenue: delivered
      .filter((o) => isWithinRange(o.createdAt, bucket))
      .reduce((sum, o) => sum + o.amount, 0),
    Expenses: approvedExpenseDates
      .filter((e) => isWithinRange(e.date, bucket))
      .reduce((sum, e) => sum + e.amount, 0),
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Revenue vs Expenses</CardTitle>
        <CardDescription>Delivered orders vs approved expenses, within filters</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -20, right: 10, top: 10 }}>
            <defs>
              <linearGradient id="reportRevenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="reportExpensesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-4)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              className="fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              className="fill-muted-foreground"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value, name) => [`$${Number(value).toLocaleString()}`, name]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="Revenue"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#reportRevenueFill)"
            />
            <Area
              type="monotone"
              dataKey="Expenses"
              stroke="var(--chart-4)"
              strokeWidth={2}
              fill="url(#reportExpensesFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
