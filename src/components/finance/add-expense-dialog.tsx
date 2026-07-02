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
import { expenseCategoryMeta, expenseCategoryOrder } from "@/lib/status-meta";
import { useAppData, type NewExpenseInput } from "@/lib/store";
import type { ExpenseCategory } from "@/lib/types";

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const NONE = "none";

export function AddExpenseDialog() {
  const { orders, vehicles, drivers, addExpense } = useAppData();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<ExpenseCategory>("fuel");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(toDateInput(new Date()));
  const [orderId, setOrderId] = React.useState(NONE);
  const [vehicleId, setVehicleId] = React.useState(NONE);
  const [driverId, setDriverId] = React.useState(NONE);
  const [notes, setNotes] = React.useState("");

  const canSubmit = Number(amount) > 0 && date;

  function reset() {
    setCategory("fuel");
    setAmount("");
    setDate(toDateInput(new Date()));
    setOrderId(NONE);
    setVehicleId(NONE);
    setDriverId(NONE);
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const input: NewExpenseInput = {
      category,
      amount: Number(amount),
      date: new Date(date).toISOString(),
      orderId: orderId === NONE ? undefined : orderId,
      vehicleId: vehicleId === NONE ? undefined : vehicleId,
      driverId: driverId === NONE ? undefined : driverId,
      notes: notes || undefined,
    };
    addExpense(input);
    reset();
    setOpen(false);
  }

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>
            Optionally link it to an order, vehicle or driver to track real profit.
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
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
              Add Expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
