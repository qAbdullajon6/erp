"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, getCustomerLifetimeValue, getCustomerOutstandingBalance } from "@/lib/mock-data";
import { getCustomerProfit } from "@/lib/reports-data";
import type { Customer, Expense, Invoice, Order } from "@/lib/types";

function Rows({ rows, tone }: { rows: { customer: Customer; value: number }[]; tone: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to show for this filter set.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.customer.id} className="flex items-center justify-between text-sm">
          <span className="truncate font-medium">{r.customer.name}</span>
          <span className={`shrink-0 font-medium ${tone}`}>{formatCurrency(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function TopCustomersReportPanel({
  customers,
  orders,
  invoices,
  expenses,
}: {
  customers: Customer[];
  orders: Order[];
  invoices: Invoice[];
  expenses: Expense[];
}) {
  const byRevenue = customers
    .map((c) => ({ customer: c, value: getCustomerLifetimeValue(c.id, orders) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const byOutstanding = customers
    .map((c) => ({ customer: c, value: getCustomerOutstandingBalance(c.id, invoices) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const byProfit = customers
    .map((c) => ({ customer: c, value: getCustomerProfit(c.id, orders, expenses, invoices) }))
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top Customers</CardTitle>
        <CardDescription>By revenue, outstanding balance, and profitability</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="profit">Profit</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="mt-3">
            <Rows rows={byRevenue} tone="text-chart-2" />
          </TabsContent>
          <TabsContent value="outstanding" className="mt-3">
            <Rows rows={byOutstanding} tone="text-chart-3" />
          </TabsContent>
          <TabsContent value="profit" className="mt-3">
            <Rows
              rows={byProfit}
              tone={byProfit.some((r) => r.value < 0) ? "text-destructive" : "text-chart-2"}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
