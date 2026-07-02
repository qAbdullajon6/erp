"use client";

import {
  Bar,
  BarChart,
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
import { getCustomerLifetimeValue } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function RevenueByCustomer() {
  const { orders, customers } = useAppData();

  const data = customers
    .map((c) => ({
      name: c.name.length > 18 ? `${c.name.slice(0, 18)}…` : c.name,
      Revenue: getCustomerLifetimeValue(c.id, orders),
    }))
    .filter((d) => d.Revenue > 0)
    .sort((a, b) => b.Revenue - a.Revenue)
    .slice(0, 8);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Revenue by Customer</CardTitle>
        <CardDescription>From delivered orders</CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              className="fill-muted-foreground"
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={120}
              className="fill-muted-foreground"
            />
            <Tooltip
              formatter={(value) => [`$${Number(value).toLocaleString()}`, "Revenue"]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="Revenue" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
