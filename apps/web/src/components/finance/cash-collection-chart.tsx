"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildTimeBuckets, isWithinRange, type DateBounds } from "@/lib/date-range";
import { useAppData } from "@/lib/store";

export function CashCollectionChart({ bounds }: { bounds: DateBounds }) {
  const { invoices } = useAppData();
  const buckets = buildTimeBuckets(bounds);
  const payments = invoices.flatMap((i) => i.payments);

  const data = buckets.map((bucket) => ({
    label: bucket.label,
    Collected: payments
      .filter((p) => isWithinRange(p.paidAt, bucket))
      .reduce((sum, p) => sum + p.amount, 0),
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Cash Collection Trend</CardTitle>
        <CardDescription>Payments received in range</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20, right: 10, top: 10 }}>
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
              formatter={(value) => [`$${Number(value).toLocaleString()}`, "Collected"]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="Collected" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
