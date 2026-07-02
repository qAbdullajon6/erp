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
import { useAppData } from "@/lib/store";

export function RevenueExpensesChart({ bounds }: { bounds: DateBounds }) {
  const { invoices, expenses } = useAppData();
  const buckets = buildTimeBuckets(bounds);
  const activeInvoices = invoices.filter((i) => i.manualStatus !== "cancelled");
  const approvedExpenses = expenses.filter((e) => e.approvalStatus === "approved");

  const data = buckets.map((bucket) => ({
    label: bucket.label,
    Revenue: activeInvoices
      .filter((i) => isWithinRange(i.issuedAt, bucket))
      .reduce((sum, i) => sum + i.amount, 0),
    Expenses: approvedExpenses
      .filter((e) => isWithinRange(e.date, bucket))
      .reduce((sum, e) => sum + e.amount, 0),
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Revenue vs Expenses</CardTitle>
        <CardDescription>Invoices issued vs approved expenses in range</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: -20, right: 10, top: 10 }}>
            <defs>
              <linearGradient id="financeRevenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="financeExpensesFill" x1="0" y1="0" x2="0" y2="1">
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
              fill="url(#financeRevenueFill)"
            />
            <Area
              type="monotone"
              dataKey="Expenses"
              stroke="var(--chart-4)"
              strokeWidth={2}
              fill="url(#financeExpensesFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
