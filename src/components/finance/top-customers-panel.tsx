"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCurrency,
  getCustomerLifetimeValue,
  getCustomerOutstandingBalance,
} from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function TopCustomersPanel() {
  const { customers, orders, invoices } = useAppData();

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

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top Customers</CardTitle>
        <CardDescription>By revenue and by outstanding balance</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">By Revenue</TabsTrigger>
            <TabsTrigger value="outstanding">By Outstanding</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="mt-3 space-y-2">
            {byRevenue.length === 0 && (
              <p className="text-sm text-muted-foreground">No revenue yet.</p>
            )}
            {byRevenue.map((r) => (
              <div key={r.customer.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{r.customer.name}</span>
                <span className="shrink-0 font-medium text-chart-2">
                  {formatCurrency(r.value)}
                </span>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="outstanding" className="mt-3 space-y-2">
            {byOutstanding.length === 0 && (
              <p className="text-sm text-muted-foreground">No outstanding balances.</p>
            )}
            {byOutstanding.map((r) => (
              <div key={r.customer.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{r.customer.name}</span>
                <span className="shrink-0 font-medium text-chart-3">
                  {formatCurrency(r.value)}
                </span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
