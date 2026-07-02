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
import { useAppData } from "@/lib/store";

const NONE = "none";

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function CreateInvoiceDialog({
  customerId,
  onOpenChange,
}: {
  customerId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { orders, addInvoice } = useAppData();
  const [amount, setAmount] = React.useState("");
  const [dueAt, setDueAt] = React.useState(() =>
    toDateInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
  );
  const [orderId, setOrderId] = React.useState(NONE);
  const [notes, setNotes] = React.useState("");

  const customerOrders = orders.filter((o) => o.customerId === customerId);
  const canSubmit = Number(amount) > 0 && dueAt;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    addInvoice({
      customerId,
      amount: Number(amount),
      dueAt: new Date(dueAt).toISOString(),
      orderId: orderId === NONE ? undefined : orderId,
      notes: notes || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription>
            Manually issue an invoice for this customer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-amount">Amount (USD)</Label>
            <Input
              id="invoice-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-due">Due date</Label>
            <Input
              id="invoice-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Linked order (optional)</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No linked order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No linked order</SelectItem>
                {customerOrders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.id} · {o.origin} → {o.destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Create Invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
