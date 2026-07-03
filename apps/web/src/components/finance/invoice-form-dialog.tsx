"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencyOrder, formatMoney } from "@/lib/currency";
import { useAppData, type NewInvoiceInput } from "@/lib/store";
import { useRole } from "@/lib/role";
import type { Currency, Invoice } from "@/lib/types";

const NONE = "none";

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function InvoiceFormDialog({
  customerId,
  invoice,
  onOpenChange,
  onSaved,
}: {
  customerId?: string;
  invoice?: Invoice;
  onOpenChange: (open: boolean) => void;
  onSaved?: (invoiceId: string) => void;
}) {
  const { customers, orders, invoices, addInvoice, updateInvoice } = useAppData();
  const { role } = useRole();
  const isEdit = !!invoice;
  const isAdmin = role === "admin";

  const activeCustomers = customers.filter((c) => c.status !== "archived");

  const [selectedCustomerId, setSelectedCustomerId] = React.useState(
    invoice?.customerId ?? customerId ?? "",
  );
  const [orderId, setOrderId] = React.useState(invoice?.orderId ?? NONE);
  const [currency, setCurrency] = React.useState<Currency>(invoice?.currency ?? "USD");
  const [subtotal, setSubtotal] = React.useState(invoice ? String(invoice.subtotal) : "");
  const [discount, setDiscount] = React.useState(invoice ? String(invoice.discount) : "0");
  const [taxRate, setTaxRate] = React.useState(invoice ? String(invoice.taxRate) : "0");
  const [dueAt, setDueAt] = React.useState(() =>
    invoice
      ? toDateInput(new Date(invoice.dueAt))
      : toDateInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
  );
  const [notes, setNotes] = React.useState(invoice?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const customerOrders = orders.filter((o) => o.customerId === selectedCustomerId);
  const ordersWithoutActiveInvoice = customerOrders.filter(
    (o) =>
      !invoices.some(
        (i) =>
          i.orderId === o.id &&
          i.manualStatus !== "cancelled" &&
          (!invoice || i.id !== invoice.id),
      ),
  );
  const selectableOrders = isAdmin
    ? ordersWithoutActiveInvoice
    : ordersWithoutActiveInvoice.filter((o) => o.status === "delivered");
  const selectedOrder = customerOrders.find((o) => o.id === orderId);
  const nonDeliveredWarning =
    isAdmin && selectedOrder && selectedOrder.status !== "delivered";

  const subtotalNum = Number(subtotal) || 0;
  const discountNum = Number(discount) || 0;
  const taxRateNum = Number(taxRate) || 0;
  const taxable = Math.max(0, subtotalNum - discountNum);
  const total = taxable + taxable * (taxRateNum / 100);

  const canSubmit =
    selectedCustomerId &&
    subtotalNum > 0 &&
    discountNum >= 0 &&
    discountNum <= subtotalNum &&
    taxRateNum >= 0 &&
    dueAt;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    const input: NewInvoiceInput = {
      customerId: selectedCustomerId,
      orderId: orderId === NONE ? undefined : orderId,
      currency,
      subtotal: subtotalNum,
      discount: discountNum,
      taxRate: taxRateNum,
      dueAt: new Date(dueAt).toISOString(),
      notes: notes || undefined,
    };

    if (isEdit) {
      updateInvoice(invoice.id, input);
      onSaved?.(invoice.id);
      onOpenChange(false);
      return;
    }

    const id = addInvoice(input);
    if (!id) {
      setError(
        "Couldn't create this invoice — the customer may be archived, or the selected order already has an active invoice.",
      );
      return;
    }
    onSaved?.(id);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${invoice.id} is a draft — editing keeps it in Draft status.`
              : "Manually issue an invoice, optionally linked to a delivered order."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!customerId && (
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select
                value={selectedCustomerId}
                onValueChange={(v) => {
                  setSelectedCustomerId(v);
                  setOrderId(NONE);
                }}
                disabled={isEdit}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {activeCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Linked order (optional)</Label>
            <Select value={orderId} onValueChange={setOrderId} disabled={!selectedCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No linked order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No linked order</SelectItem>
                {selectableOrders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.id} · {o.origin} → {o.destination}
                    {o.status !== "delivered" ? ` (${o.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Only delivered orders without an existing invoice can be linked.
              </p>
            )}
            {nonDeliveredWarning && (
              <p className="flex items-center gap-1.5 text-xs text-chart-3">
                <AlertTriangle className="size-3.5" />
                Admin override: this order isn&apos;t delivered yet.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOrder.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subtotal">Subtotal</Label>
              <Input
                id="subtotal"
                type="number"
                min="0"
                step="0.01"
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount">Discount</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxRate">Tax % (placeholder)</Label>
              <Input
                id="taxRate"
                type="number"
                min="0"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total due</span>
              <span className="font-medium">{formatMoney(total, currency)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueAt">Due date</Label>
            <Input
              id="dueAt"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-notes">Notes (optional)</Label>
            <Textarea
              id="invoice-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isEdit ? "Save Changes" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
