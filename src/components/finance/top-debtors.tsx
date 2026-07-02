"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { customers, formatCurrency, getCustomerOutstandingBalance } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function TopDebtors() {
  const { invoices } = useAppData();

  const debtors = customers
    .map((c) => ({
      customer: c,
      balance: getCustomerOutstandingBalance(c.id, invoices),
    }))
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Debtors</CardTitle>
        <CardDescription>Customers with the largest outstanding balance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {debtors.length === 0 && (
          <p className="text-sm text-muted-foreground">No outstanding balances right now.</p>
        )}
        {debtors.map((d) => (
          <div key={d.customer.id} className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{d.customer.name}</p>
              <p className="text-xs text-muted-foreground">{d.customer.city}</p>
            </div>
            <span className="shrink-0 text-sm font-medium text-destructive">
              {formatCurrency(d.balance)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
