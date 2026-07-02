"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  formatCurrency,
  formatDate,
  getCustomer,
  getInvoicePaidAmount,
  getInvoiceRemaining,
  getInvoiceStatus,
} from "@/lib/mock-data";
import { invoiceStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Invoice } from "@/lib/types";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";

export function InvoiceTable() {
  const { invoices } = useAppData();
  const [paying, setPaying] = React.useState<Invoice | null>(null);

  const sorted = [...invoices].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((inv) => {
              const customer = getCustomer(inv.customerId);
              const status = getInvoiceStatus(inv);
              const remaining = getInvoiceRemaining(inv);
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.id}</TableCell>
                  <TableCell className="text-muted-foreground">{customer?.name}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.orderId}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(getInvoicePaidAmount(inv))}
                  </TableCell>
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
                  <TableCell className="text-muted-foreground">
                    {formatDate(inv.dueAt)}
                  </TableCell>
                  <TableCell>
                    {status !== "paid" && (
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
      </CardContent>

      {paying && (
        <RecordPaymentDialog
          key={paying.id}
          invoice={paying}
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
        />
      )}
    </Card>
  );
}
