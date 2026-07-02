"use client";

import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getCustomer, getInvoiceRemaining, getInvoiceStatus } from "@/lib/mock-data";
import { invoiceStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

export function UnpaidInvoicesSummary() {
  const { invoices } = useAppData();

  const unpaid = invoices
    .filter((i) => getInvoiceStatus(i) !== "paid")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unpaid Invoices</CardTitle>
        <CardDescription>{unpaid.length} invoices awaiting payment</CardDescription>
        <CardAction>
          <Link href="/finance" className="text-xs font-medium text-primary hover:underline">
            Go to Finance
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {unpaid.length === 0 && (
          <p className="text-sm text-muted-foreground">Everything is paid up.</p>
        )}
        {unpaid.map((inv) => {
          const status = getInvoiceStatus(inv);
          const customer = getCustomer(inv.customerId);
          return (
            <div key={inv.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{customer?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.id} · due {formatDate(inv.dueAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={invoiceStatusMeta[status].badgeClass}>
                  {invoiceStatusMeta[status].label}
                </Badge>
                <span className="font-medium">{formatCurrency(getInvoiceRemaining(inv))}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
