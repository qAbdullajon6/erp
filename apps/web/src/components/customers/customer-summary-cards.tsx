"use client";

import { AlertTriangle, Users, UserCheck, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, getCustomerOutstandingBalance, getCustomerOverdueBalance } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function CustomerSummaryCards() {
  const { customers, invoices } = useAppData();

  const nonArchived = customers.filter((c) => c.status !== "archived");
  const active = nonArchived.filter((c) => c.status === "active");
  const totalOutstanding = nonArchived.reduce(
    (sum, c) => sum + getCustomerOutstandingBalance(c.id, invoices),
    0,
  );
  const withOverdue = nonArchived.filter((c) => getCustomerOverdueBalance(c.id, invoices) > 0);

  const cards = [
    {
      label: "Total Customers",
      value: nonArchived.length.toString(),
      sub: `${customers.length - nonArchived.length} archived`,
      icon: Users,
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Active Customers",
      value: active.length.toString(),
      sub: `${nonArchived.length - active.length} at risk or inactive`,
      icon: UserCheck,
      tone: "text-chart-2 bg-chart-2/10",
    },
    {
      label: "Total Outstanding Balance",
      value: formatCurrency(totalOutstanding),
      sub: "across all customers",
      icon: Wallet,
      tone: "text-chart-3 bg-chart-3/10",
    },
    {
      label: "Overdue Invoices",
      value: withOverdue.length.toString(),
      sub: "customers need follow-up",
      icon: AlertTriangle,
      tone: "text-destructive bg-destructive/10",
      subTone: withOverdue.length > 0 ? "text-destructive" : undefined,
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
