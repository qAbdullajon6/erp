"use client";

import { TrendingDown, TrendingUp, Wallet, AlertTriangle, CheckCircle2, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, getInvoiceRemaining, getInvoiceStatus } from "@/lib/mock-data";
import { isWithinRange, type DateBounds } from "@/lib/date-range";
import { useAppData } from "@/lib/store";

export function FinanceDashboardSummary({ bounds }: { bounds: DateBounds }) {
  const { invoices, expenses } = useAppData();

  const activeInvoices = invoices.filter((i) => i.manualStatus !== "cancelled");

  const totalRevenue = activeInvoices
    .filter((i) => isWithinRange(i.issuedAt, bounds))
    .reduce((sum, i) => sum + i.amount, 0);

  const collectedPayments = activeInvoices
    .flatMap((i) => i.payments)
    .filter((p) => isWithinRange(p.paidAt, bounds))
    .reduce((sum, p) => sum + p.amount, 0);

  const outstandingReceivables = activeInvoices.reduce(
    (sum, i) => sum + getInvoiceRemaining(i),
    0,
  );

  const overdueReceivables = activeInvoices
    .filter((i) => getInvoiceStatus(i) === "overdue")
    .reduce((sum, i) => sum + getInvoiceRemaining(i), 0);

  const totalExpenses = expenses
    .filter((e) => e.approvalStatus === "approved" && isWithinRange(e.date, bounds))
    .reduce((sum, e) => sum + e.amount, 0);

  const grossProfit = totalRevenue - totalExpenses;

  const cards = [
    {
      label: "Total Revenue",
      value: formatCurrency(totalRevenue),
      sub: "invoices issued in range",
      icon: TrendingUp,
      tone: "text-chart-2 bg-chart-2/10",
    },
    {
      label: "Collected Payments",
      value: formatCurrency(collectedPayments),
      sub: "payments received in range",
      icon: CheckCircle2,
      tone: "text-chart-2 bg-chart-2/10",
    },
    {
      label: "Outstanding Receivables",
      value: formatCurrency(outstandingReceivables),
      sub: "all unpaid invoices, current",
      icon: Wallet,
      tone: "text-chart-3 bg-chart-3/10",
    },
    {
      label: "Overdue Receivables",
      value: formatCurrency(overdueReceivables),
      sub: "past due, current",
      icon: AlertTriangle,
      tone: "text-destructive bg-destructive/10",
      subTone: overdueReceivables > 0 ? "text-destructive" : undefined,
    },
    {
      label: "Total Expenses",
      value: formatCurrency(totalExpenses),
      sub: "approved, in range",
      icon: TrendingDown,
      tone: "text-chart-4 bg-chart-4/10",
    },
    {
      label: "Est. Gross Profit",
      value: formatCurrency(grossProfit),
      sub: "revenue minus expenses, in range",
      icon: PiggyBank,
      tone: "text-primary bg-primary/10",
      subTone: grossProfit >= 0 ? "text-chart-2" : "text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <div className={cn("flex size-7 items-center justify-center rounded-lg", c.tone)}>
                <c.icon className="size-3.5" />
              </div>
            </div>
            <div className="text-xl font-semibold tracking-tight">{c.value}</div>
            <p className={cn("text-xs text-muted-foreground", c.subTone)}>{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
