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
import { useAppData, type NewOrderInput } from "@/lib/store";

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface NewOrderDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultCustomerId?: string;
  hideTrigger?: boolean;
}

export function NewOrderDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultCustomerId,
  hideTrigger,
}: NewOrderDialogProps = {}) {
  const { customers, addOrder } = useAppData();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const activeCustomers = customers.filter((c) => c.status !== "archived");
  const preselectedCustomer = customers.find((c) => c.id === defaultCustomerId);

  const [form, setForm] = React.useState(() => ({
    customerId: defaultCustomerId ?? "",
    contactPerson: preselectedCustomer?.contactPerson ?? "",
    cargo: "",
    weightTons: "",
    packageCount: "",
    origin: "",
    destination: "",
    pickupDate: toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    deliveryDate: toDatetimeLocal(new Date(Date.now() + 48 * 60 * 60 * 1000)),
    amount: "",
    operator: "Oyatillo Farhadov",
    notes: "",
  }));

  const canSubmit =
    form.customerId &&
    form.contactPerson &&
    form.cargo &&
    form.weightTons &&
    form.origin &&
    form.destination &&
    form.amount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const input: NewOrderInput = {
      customerId: form.customerId,
      contactPerson: form.contactPerson,
      cargo: form.cargo,
      weightTons: Number(form.weightTons),
      packageCount: Number(form.packageCount) || 0,
      origin: form.origin,
      destination: form.destination,
      pickupDate: new Date(form.pickupDate).toISOString(),
      deliveryDate: new Date(form.deliveryDate).toISOString(),
      amount: Number(form.amount),
      operator: form.operator,
      notes: form.notes || undefined,
    };
    addOrder(input);
    setOpen(false);
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((c) => c.id === customerId);
    setForm((f) => ({
      ...f,
      customerId,
      contactPerson: customer?.contactPerson ?? f.contactPerson,
    }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="size-4" />
            New Order
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Order</DialogTitle>
          <DialogDescription>
            Order will be created with status <span className="font-medium">Pending</span>,
            ready for dispatch.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="customer">Customer</Label>
              <Select
                value={form.customerId}
                onValueChange={handleCustomerChange}
                disabled={!!defaultCustomerId}
              >
                <SelectTrigger id="customer" className="w-full">
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

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="contact">Contact person</Label>
              <Input
                id="contact"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Full name"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="cargo">Cargo type</Label>
              <Input
                id="cargo"
                value={form.cargo}
                onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                placeholder="e.g. Cotton textiles"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weight">Weight (tons)</Label>
              <Input
                id="weight"
                type="number"
                min="0"
                step="0.1"
                value={form.weightTons}
                onChange={(e) => setForm((f) => ({ ...f, weightTons: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="packages">Package count</Label>
              <Input
                id="packages"
                type="number"
                min="0"
                value={form.packageCount}
                onChange={(e) => setForm((f) => ({ ...f, packageCount: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="origin">Origin</Label>
              <Input
                id="origin"
                value={form.origin}
                onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
                placeholder="Tashkent"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="destination">Destination</Label>
              <Input
                id="destination"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                placeholder="Samarkand"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pickup">Pickup date</Label>
              <Input
                id="pickup"
                type="datetime-local"
                value={form.pickupDate}
                onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delivery">Delivery date</Label>
              <Input
                id="delivery"
                type="datetime-local"
                value={form.deliveryDate}
                onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="amount">Agreed price (USD)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Customer only accepts morning deliveries"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Create Order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
