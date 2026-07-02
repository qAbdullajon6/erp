"use client";

import { FileText, PiggyBank, Receipt } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { formatDateTime, getCustomer } from "@/lib/mock-data";
import { expenseCategoryMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

interface ActivityRow {
  id: string;
  at: string;
  icon: typeof FileText;
  label: string;
  description: string;
}

export function RecentFinancialActivity() {
  const { invoices, expenses, customers } = useAppData();

  const invoiceEvents: ActivityRow[] = invoices.map((inv) => ({
    id: `invoice-${inv.id}`,
    at: inv.issuedAt,
    icon: FileText,
    label: `${inv.id} issued`,
    description: `${getCustomer(inv.customerId, customers)?.name ?? "Customer"} · ${formatMoney(inv.amount, inv.currency)}`,
  }));

  const paymentEvents: ActivityRow[] = invoices.flatMap((inv) =>
    inv.payments.map((p) => ({
      id: `payment-${p.id}`,
      at: p.paidAt,
      icon: PiggyBank,
      label: `Payment recorded on ${inv.id}`,
      description: formatMoney(p.amount, p.currency),
    })),
  );

  const expenseEvents: ActivityRow[] = expenses.map((e) => ({
    id: `expense-${e.id}`,
    at: e.date,
    icon: Receipt,
    label: `${expenseCategoryMeta[e.category].label} expense logged`,
    description: formatMoney(e.amount, e.currency),
  }));

  const activity = [...invoiceEvents, ...paymentEvents, ...expenseEvents]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Financial Activity</CardTitle>
        <CardDescription>Latest invoices, payments and expenses</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activity.length === 0 && (
          <p className="text-sm text-muted-foreground">No financial activity yet.</p>
        )}
        {activity.map((a) => (
          <div key={a.id} className="flex items-start gap-3">
            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <a.icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.description}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(a.at)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
