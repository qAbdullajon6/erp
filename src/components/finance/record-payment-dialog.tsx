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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, getInvoiceRemaining } from "@/lib/mock-data";
import { paymentMethodMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Invoice, PaymentMethod } from "@/lib/types";

export function RecordPaymentDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice;
  onOpenChange: (open: boolean) => void;
}) {
  const { recordPayment } = useAppData();
  const remaining = getInvoiceRemaining(invoice);
  const [amount, setAmount] = React.useState(String(remaining));
  const [method, setMethod] = React.useState<PaymentMethod>("bank_transfer");

  const parsedAmount = Number(amount);
  const canSubmit = parsedAmount > 0 && parsedAmount <= remaining;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    recordPayment(invoice.id, parsedAmount, method);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {invoice.id} · {formatCurrency(remaining)} remaining
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              max={remaining}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {parsedAmount > remaining && (
              <p className="text-xs text-destructive">
                Cannot exceed remaining balance of {formatCurrency(remaining)}.
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
                {(Object.keys(paymentMethodMeta) as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {paymentMethodMeta[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
