"use client";

import { AlertTriangle, CheckCircle2, Hourglass, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, getInvoicePaidAmount, getInvoiceRemaining, getInvoiceStatus } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function FinanceSummary() {
  const { invoices } = useAppData();

  const totalOutstanding = invoices.reduce((sum, i) => sum + getInvoiceRemaining(i), 0);
  const overdueInvoices = invoices.filter((i) => getInvoiceStatus(i) === "overdue");
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + getInvoiceRemaining(i), 0);
  const totalCollected = invoices.reduce((sum, i) => sum + getInvoicePaidAmount(i), 0);
  const paidCount = invoices.filter((i) => getInvoiceStatus(i) === "paid").length;
  const pending = invoices.filter((i) =>
    ["sent", "partially_paid"].includes(getInvoiceStatus(i)),
  );
  const pendingAmount = pending.reduce((sum, i) => sum + getInvoiceRemaining(i), 0);

  const cards = [
    {
      label: "Total Outstanding",
      value: formatCurrency(totalOutstanding),
      sub: `${invoices.length} invoices total`,
      icon: Wallet,
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Overdue",
      value: formatCurrency(overdueAmount),
      sub: `${overdueInvoices.length} invoices overdue`,
      icon: AlertTriangle,
      tone: "text-destructive bg-destructive/10",
      subTone: overdueInvoices.length > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Collected",
      value: formatCurrency(totalCollected),
      sub: `${paidCount} invoices fully paid`,
      icon: CheckCircle2,
      tone: "text-chart-2 bg-chart-2/10",
    },
    {
      label: "Pending Collection",
      value: formatCurrency(pendingAmount),
      sub: `${pending.length} invoices not yet due`,
      icon: Hourglass,
      tone: "text-chart-5 bg-chart-5/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <div className={cn("flex size-8 items-center justify-center rounded-lg", c.tone)}>
                <c.icon className="size-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{c.value}</div>
            <p className={cn("text-xs text-muted-foreground", c.subTone)}>{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
