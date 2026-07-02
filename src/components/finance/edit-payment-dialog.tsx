"use client";

import * as React from "react";
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
import { formatMoney } from "@/lib/currency";
import { getInvoicePaidAmount } from "@/lib/mock-data";
import { paymentMethodMeta, paymentMethodOrder } from "@/lib/status-meta";
import { useAppData, type PaymentInput } from "@/lib/store";
import type { Invoice, Payment, PaymentMethod } from "@/lib/types";

export function EditPaymentDialog({
  invoice,
  payment,
  onOpenChange,
}: {
  invoice: Invoice;
  payment: Payment;
  onOpenChange: (open: boolean) => void;
}) {
  const { updatePayment } = useAppData();
  const [amount, setAmount] = React.useState(String(payment.amount));
  const [method, setMethod] = React.useState<PaymentMethod>(payment.method);
  const [referenceNumber, setReferenceNumber] = React.useState(payment.referenceNumber ?? "");
  const [notes, setNotes] = React.useState(payment.notes ?? "");

  const otherPaymentsTotal = getInvoicePaidAmount(invoice) - payment.amount;
  const maxAllowed = invoice.amount - otherPaymentsTotal;
  const parsedAmount = Number(amount);
  const canSubmit = parsedAmount > 0 && parsedAmount <= maxAllowed;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const input: PaymentInput = {
      amount: parsedAmount,
      currency: payment.currency,
      method,
      referenceNumber: referenceNumber || undefined,
      notes: notes || undefined,
    };
    updatePayment(invoice.id, payment.id, input);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
          <DialogDescription>
            {invoice.id} · max {formatMoney(maxAllowed, payment.currency)} for this payment
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-amount">Amount</Label>
            <Input
              id="edit-amount"
              type="number"
              min="0"
              max={maxAllowed}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {parsedAmount > maxAllowed && (
              <p className="text-xs text-destructive">
                Cannot exceed {formatMoney(maxAllowed, payment.currency)} (invoice total minus
                other payments).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentMethodOrder.map((m) => (
                  <SelectItem key={m} value={m}>
                    {paymentMethodMeta[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference number (optional)</Label>
            <Input
              id="reference"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">Notes (optional)</Label>
            <Textarea
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
