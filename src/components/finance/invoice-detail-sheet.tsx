"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/currency";
import {
  formatDate,
  formatDateTime,
  getCustomer,
  getInvoicePaidAmount,
  getInvoiceOverdueDays,
  getInvoiceRemaining,
  getInvoiceStatus,
} from "@/lib/mock-data";
import { invoiceStatusMeta, paymentMethodMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Invoice, Payment } from "@/lib/types";
import { OrderDetailSheet } from "@/components/orders/order-detail-sheet";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { InvoiceFormDialog } from "@/components/finance/invoice-form-dialog";
import { EditPaymentDialog } from "@/components/finance/edit-payment-dialog";
import { DeletePaymentDialog } from "@/components/finance/delete-payment-dialog";

export function InvoiceDetailSheet({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { customers, orders, markInvoiceSent, cancelInvoice } = useAppData();
  const [showOrder, setShowOrder] = React.useState(false);
  const [showPay, setShowPay] = React.useState(false);
  const [showEdit, setShowEdit] = React.useState(false);
  const [editingPayment, setEditingPayment] = React.useState<Payment | null>(null);
  const [deletingPayment, setDeletingPayment] = React.useState<Payment | null>(null);
  const [sendNote, setSendNote] = React.useState(false);

  if (!invoice) return null;

  const customer = getCustomer(invoice.customerId, customers);
  const linkedOrder = orders.find((o) => o.id === invoice.orderId) ?? null;
  const status = getInvoiceStatus(invoice);
  const meta = invoiceStatusMeta[status];
  const remaining = getInvoiceRemaining(invoice);
  const overdueDays = getInvoiceOverdueDays(invoice);
  const taxable = Math.max(0, invoice.subtotal - invoice.discount);
  const taxAmount = taxable * (invoice.taxRate / 100);

  const activity = [
    { id: `issued-${invoice.id}`, at: invoice.issuedAt, label: "Invoice issued", description: formatMoney(invoice.amount, invoice.currency) },
    ...invoice.payments.map((p) => ({
      id: p.id,
      at: p.paidAt,
      label: "Payment recorded",
      description: `${formatMoney(p.amount, p.currency)} · ${paymentMethodMeta[p.method].label}`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {invoice.id}
            <Badge variant="outline" className={meta.badgeClass}>
              {meta.label}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            {customer?.name} · Due {formatDate(invoice.dueAt)}
            {status === "overdue" && ` · ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <div className="flex flex-wrap gap-2">
            {status === "draft" && (
              <>
                <Button size="sm" onClick={() => markInvoiceSent(invoice.id)}>
                  Mark as Sent
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSendNote(true)}>
                  Send (placeholder)
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
                  Edit Draft
                </Button>
              </>
            )}
            {(status === "sent" || status === "partially_paid" || status === "overdue") && (
              <Button size="sm" onClick={() => setShowPay(true)}>
                Record Payment
              </Button>
            )}
            {status !== "cancelled" && status !== "paid" && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => cancelInvoice(invoice.id)}
              >
                Cancel Invoice
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setSendNote(true)}>
              Download / Print
            </Button>
          </div>
          {sendNote && (
            <p className="text-xs text-muted-foreground">
              Email sending and PDF export aren&apos;t implemented in this demo yet.
            </p>
          )}

          <Separator />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Customer</dt>
              <dd className="font-medium">{customer?.name ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Linked order</dt>
              <dd className="font-medium">
                {linkedOrder ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setShowOrder(true)}
                  >
                    {linkedOrder.id}
                  </button>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Issue date</dt>
              <dd className="font-medium">{formatDate(invoice.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due date</dt>
              <dd className={status === "overdue" ? "font-medium text-destructive" : "font-medium"}>
                {formatDate(invoice.dueAt)}
              </dd>
            </div>
          </dl>

          <Separator />

          <div className="space-y-1.5 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Line items</p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatMoney(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatMoney(invoice.discount, invoice.currency)}</span>
              </div>
            )}
            {invoice.taxRate > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
                <span>{formatMoney(taxAmount, invoice.currency)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex items-center justify-between font-medium">
              <span>Total</span>
              <span>{formatMoney(invoice.amount, invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span>{formatMoney(getInvoicePaidAmount(invoice), invoice.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Remaining balance</span>
              <span className={remaining > 0 ? "font-medium text-destructive" : "font-medium"}>
                {formatMoney(remaining, invoice.currency)}
              </span>
            </div>
            {invoice.notes && (
              <p className="mt-2 text-xs text-muted-foreground">{invoice.notes}</p>
            )}
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Payment history ({invoice.payments.length})
            </p>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{formatMoney(p.amount, p.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {paymentMethodMeta[p.method].label}
                        {p.referenceNumber ? ` · ${p.referenceNumber}` : ""} ·{" "}
                        {formatDate(p.paidAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditingPayment(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive"
                        onClick={() => setDeletingPayment(p)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Activity</p>
            <ol className="space-y-2">
              {activity.map((event) => (
                <li key={event.id} className="text-sm">
                  <p className="font-medium">{event.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.description} · {formatDateTime(event.at)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </SheetContent>

      {showOrder && linkedOrder && (
        <OrderDetailSheet
          order={linkedOrder}
          onOpenChange={(open) => {
            if (!open) setShowOrder(false);
          }}
        />
      )}
      {showPay && (
        <RecordPaymentDialog
          invoice={invoice}
          onOpenChange={(open) => {
            if (!open) setShowPay(false);
          }}
        />
      )}
      {showEdit && (
        <InvoiceFormDialog invoice={invoice} onOpenChange={setShowEdit} />
      )}
      {editingPayment && (
        <EditPaymentDialog
          key={editingPayment.id}
          invoice={invoice}
          payment={editingPayment}
          onOpenChange={(open) => {
            if (!open) setEditingPayment(null);
          }}
        />
      )}
      {deletingPayment && (
        <DeletePaymentDialog
          invoice={invoice}
          payment={deletingPayment}
          onOpenChange={(open) => {
            if (!open) setDeletingPayment(null);
          }}
        />
      )}
    </Sheet>
  );
}
