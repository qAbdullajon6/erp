"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatDate,
  getCustomerInvoices,
  getInvoiceRemaining,
  getInvoiceStatus,
} from "@/lib/mock-data";
import { invoiceStatusMeta, paymentMethodMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import { useRole } from "@/lib/role";
import { hasCapability } from "@/lib/permissions";
import type { Invoice } from "@/lib/types";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";

export function CustomerInvoicesTab({ customerId }: { customerId: string }) {
  const { invoices } = useAppData();
  const { role } = useRole();
  const canRecordPayments = hasCapability(role, "record_payments");
  const [paying, setPaying] = React.useState<Invoice | null>(null);

  const customerInvoices = getCustomerInvoices(customerId, invoices).sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );

  const payments = customerInvoices
    .flatMap((inv) => inv.payments.map((p) => ({ ...p, invoiceId: inv.id })))
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  if (customerInvoices.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>;
  }

  return (
    <div className="space-y-5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {customerInvoices.map((inv) => {
            const status = getInvoiceStatus(inv);
            const remaining = getInvoiceRemaining(inv);
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.id}</TableCell>
                <TableCell className="text-right">{formatCurrency(inv.amount)}</TableCell>
                <TableCell
                  className={
                    remaining > 0
                      ? "text-right font-medium text-destructive"
                      : "text-right text-muted-foreground"
                  }
                >
                  {formatCurrency(remaining)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={invoiceStatusMeta[status].badgeClass}>
                    {invoiceStatusMeta[status].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(inv.dueAt)}</TableCell>
                <TableCell>
                  {status !== "paid" && canRecordPayments && (
                    <Button size="sm" variant="outline" onClick={() => setPaying(inv)}>
                      Record Payment
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Payment history ({payments.length})
        </p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.invoiceId} · {paymentMethodMeta[p.method].label}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(p.paidAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {paying && (
        <RecordPaymentDialog
          key={paying.id}
          invoice={paying}
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
        />
      )}
    </div>
  );
}
