"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOnTimeDeliveryRate } from "@/lib/mock-data";
import { buildTimeBuckets, isWithinRange, type DateBounds } from "@/lib/date-range";
import type { Order } from "@/lib/types";

export function DeliveryPerformanceTrend({
  orders,
  bounds,
}: {
  orders: Order[];
  bounds: DateBounds;
}) {
  const buckets = buildTimeBuckets(bounds);
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    "On-time %": getOnTimeDeliveryRate(orders.filter((o) => isWithinRange(o.createdAt, bucket))),
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Delivery Performance Trend</CardTitle>
        <CardDescription>On-time delivery rate over the selected range</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -20, right: 10, top: 10 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              className="fill-muted-foreground"
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              className="fill-muted-foreground"
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(value) => [`${value}%`, "On-time"]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="On-time %"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
