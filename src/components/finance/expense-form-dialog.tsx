"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { currencyOrder } from "@/lib/currency";
import { expenseCategoryMeta, expenseCategoryOrder } from "@/lib/status-meta";
import { useAppData, type NewExpenseInput } from "@/lib/store";
import type { Currency, Expense, ExpenseCategory } from "@/lib/types";

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const NONE = "none";

export function ExpenseFormDialog({
  expense,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger,
}: {
  expense?: Expense;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
} = {}) {
  const { orders, vehicles, drivers, addExpense, updateExpense } = useAppData();
  const isEdit = !!expense;
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const [category, setCategory] = React.useState<ExpenseCategory>(expense?.category ?? "fuel");
  const [amount, setAmount] = React.useState(expense ? String(expense.amount) : "");
  const [currency, setCurrency] = React.useState<Currency>(expense?.currency ?? "USD");
  const [date, setDate] = React.useState(() =>
    expense ? toDateInput(new Date(expense.date)) : toDateInput(new Date()),
  );
  const [orderId, setOrderId] = React.useState(expense?.orderId ?? NONE);
  const [vehicleId, setVehicleId] = React.useState(expense?.vehicleId ?? NONE);
  const [driverId, setDriverId] = React.useState(expense?.driverId ?? NONE);
  const [payee, setPayee] = React.useState(expense?.payee ?? "");
  const [receiptRef, setReceiptRef] = React.useState(expense?.receiptRef ?? "");
  const [notes, setNotes] = React.useState(expense?.notes ?? "");

  const canSubmit = Number(amount) > 0 && date;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const input: NewExpenseInput = {
      category,
      amount: Number(amount),
      currency,
      date: new Date(date).toISOString(),
      orderId: orderId === NONE ? undefined : orderId,
      vehicleId: vehicleId === NONE ? undefined : vehicleId,
      driverId: driverId === NONE ? undefined : driverId,
      payee: payee || undefined,
      receiptRef: receiptRef || undefined,
      notes: notes || undefined,
    };
    if (isEdit) {
      updateExpense(expense.id, input);
    } else {
      addExpense(input);
    }
    setOpen(false);
  }

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && !isEdit && (
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="size-4" />
            Add Expense
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Expense" : "Add Expense"}</DialogTitle>
          <DialogDescription>
            Optionally link it to an order, vehicle or driver to track real profit. New expenses
            need approval before they count toward profitability.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategoryOrder.map((c) => (
                    <SelectItem key={c} value={c}>
                      {expenseCategoryMeta[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

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
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="payee">Vendor / Payee (optional)</Label>
              <Input
                id="payee"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="e.g. Uzbekneftegaz AZS-14"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Order (optional)</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No linked order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No linked order</SelectItem>
                  {recentOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.id} · {o.origin} → {o.destination}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Vehicle (optional)</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.model} · {v.plate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Driver (optional)</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="receiptRef">Receipt / document (optional)</Label>
              <Input
                id="receiptRef"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="Receipt number or filename (upload not implemented yet)"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isEdit ? "Save Changes" : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
