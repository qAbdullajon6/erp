"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import {
  formatDate,
  getCustomer,
  getInvoiceOverdueDays,
  getInvoiceRemaining,
  getInvoiceStatus,
} from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function OverdueInvoicesPanel() {
  const { invoices, customers } = useAppData();

  const overdue = invoices
    .filter((i) => getInvoiceStatus(i) === "overdue")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Overdue Invoices</CardTitle>
        <CardDescription>{overdue.length} invoices past due</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {overdue.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing overdue right now.</p>
        )}
        {overdue.map((inv) => {
          const customer = getCustomer(inv.customerId, customers);
          const days = getInvoiceOverdueDays(inv);
          return (
            <div key={inv.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{customer?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.id} · due {formatDate(inv.dueAt)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium text-destructive">
                  {formatMoney(getInvoiceRemaining(inv), inv.currency)}
                </p>
                <p className="text-xs text-destructive">
                  {days} day{days === 1 ? "" : "s"} overdue
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
