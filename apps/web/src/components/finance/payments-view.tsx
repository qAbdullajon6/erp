"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { formatDate, getCustomer } from "@/lib/mock-data";
import { paymentMethodMeta, paymentMethodOrder } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Invoice, Payment, PaymentMethod } from "@/lib/types";
import { EditPaymentDialog } from "@/components/finance/edit-payment-dialog";
import { DeletePaymentDialog } from "@/components/finance/delete-payment-dialog";

type MethodFilter = "all" | PaymentMethod;

const PAGE_SIZE = 10;

interface FlatPayment {
  payment: Payment;
  invoice: Invoice;
}

export function PaymentsView() {
  const { invoices, customers } = useAppData();
  const [search, setSearch] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState<MethodFilter>("all");
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<FlatPayment | null>(null);
  const [deleting, setDeleting] = React.useState<FlatPayment | null>(null);

  const allPayments: FlatPayment[] = invoices.flatMap((invoice) =>
    invoice.payments.map((payment) => ({ payment, invoice })),
  );

  const filtered = allPayments
    .filter((fp) => (methodFilter === "all" ? true : fp.payment.method === methodFilter))
    .filter((fp) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const customer = getCustomer(fp.invoice.customerId, customers);
      return (
        fp.payment.id.toLowerCase().includes(q) ||
        fp.invoice.id.toLowerCase().includes(q) ||
        (fp.payment.referenceNumber ?? "").toLowerCase().includes(q) ||
        (customer?.name.toLowerCase().includes(q) ?? false)
      );
    })
    .sort((a, b) => new Date(b.payment.paidAt).getTime() - new Date(a.payment.paidAt).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search payment, invoice, customer, reference..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={methodFilter}
          onValueChange={(v) => {
            setMethodFilter(v as MethodFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {paymentMethodOrder.map((m) => (
              <SelectItem key={m} value={m}>
                {paymentMethodMeta[m].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((fp) => {
                const customer = getCustomer(fp.invoice.customerId, customers);
                return (
                  <TableRow key={fp.payment.id}>
                    <TableCell className="font-medium">{fp.payment.id}</TableCell>
                    <TableCell className="text-muted-foreground">{fp.invoice.id}</TableCell>
                    <TableCell className="text-muted-foreground">{customer?.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(fp.payment.amount, fp.payment.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {paymentMethodMeta[fp.payment.method].label}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fp.payment.referenceNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(fp.payment.paidAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditing(fp)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => setDeleting(fp)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No payments match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {filtered.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditPaymentDialog
          key={editing.payment.id}
          invoice={editing.invoice}
          payment={editing.payment}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
      {deleting && (
        <DeletePaymentDialog
          invoice={deleting.invoice}
          payment={deleting.payment}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
