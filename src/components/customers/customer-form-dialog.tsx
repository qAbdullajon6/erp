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
import { paymentTermsMeta, paymentTermsOrder } from "@/lib/status-meta";
import { useAppData, type CustomerInput } from "@/lib/store";
import type { Customer, PaymentTerms } from "@/lib/types";

function toFormState(customer?: Customer) {
  return {
    name: customer?.name ?? "",
    industry: customer?.industry ?? "",
    contactPerson: customer?.contactPerson ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    city: customer?.city ?? "",
    country: customer?.country ?? "Uzbekistan",
    taxId: customer?.taxId ?? "",
    paymentTerms: (customer?.paymentTerms ?? "net_30") as PaymentTerms,
    creditLimit: customer ? String(customer.creditLimit) : "",
    usualRoutes: customer?.usualRoutes.join(", ") ?? "",
    deliveryNotes: customer?.deliveryNotes ?? "",
    internalNotes: customer?.internalNotes ?? "",
  };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CustomerFormDialog({
  customer,
  onOpenChange,
  onSaved,
}: {
  customer?: Customer;
  onOpenChange: (open: boolean) => void;
  onSaved?: (customerId: string) => void;
}) {
  const { addCustomer, updateCustomer } = useAppData();
  const isEdit = !!customer;
  const [form, setForm] = React.useState(() => toFormState(customer));
  const [touched, setTouched] = React.useState(false);

  const emailValid = emailPattern.test(form.email);
  const creditLimitValid = form.creditLimit !== "" && Number(form.creditLimit) >= 0;
  const canSubmit =
    form.name.trim() &&
    form.industry.trim() &&
    form.contactPerson.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    emailValid &&
    form.address.trim() &&
    form.city.trim() &&
    form.country.trim() &&
    creditLimitValid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;

    const input: CustomerInput = {
      name: form.name.trim(),
      industry: form.industry.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      taxId: form.taxId.trim() || undefined,
      paymentTerms: form.paymentTerms,
      creditLimit: Number(form.creditLimit),
      usualRoutes: form.usualRoutes
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
      deliveryNotes: form.deliveryNotes.trim() || undefined,
      internalNotes: form.internalNotes.trim() || undefined,
    };

    if (isEdit) {
      updateCustomer(customer.id, input);
      onSaved?.(customer.id);
    } else {
      const id = addCustomer(input);
      onSaved?.(id);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Customer" : "New Customer"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update ${customer.name}'s profile.`
              : "New customers start with Active status."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Company name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Silk Road Foods"
              />
              {touched && !form.name.trim() && (
                <p className="text-xs text-destructive">Company name is required.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                placeholder="e.g. Textiles"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactPerson">Contact person</Label>
              <Input
                id="contactPerson"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+998 90 123 45 67"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              {touched && form.email && !emailValid && (
                <p className="text-xs text-destructive">Enter a valid email address.</p>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="address">Billing address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taxId">Tax ID (STIR/INN)</Label>
              <Input
                id="taxId"
                value={form.taxId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                placeholder="e.g. 301245678"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Payment terms</Label>
              <Select
                value={form.paymentTerms}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v as PaymentTerms }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOrder.map((t) => (
                    <SelectItem key={t} value={t}>
                      {paymentTermsMeta[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="creditLimit">Credit limit (USD)</Label>
              <Input
                id="creditLimit"
                type="number"
                min="0"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              />
              {touched && !creditLimitValid && (
                <p className="text-xs text-destructive">Enter a valid credit limit.</p>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="usualRoutes">Usual routes (comma-separated)</Label>
              <Input
                id="usualRoutes"
                value={form.usualRoutes}
                onChange={(e) => setForm((f) => ({ ...f, usualRoutes: e.target.value }))}
                placeholder="Tashkent → Samarkand, Tashkent → Bukhara"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="deliveryNotes">Default delivery notes (optional)</Label>
              <Textarea
                id="deliveryNotes"
                value={form.deliveryNotes}
                onChange={(e) => setForm((f) => ({ ...f, deliveryNotes: e.target.value }))}
                placeholder="e.g. Only accepts morning deliveries"
                rows={2}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="internalNotes">Internal notes (optional)</Label>
              <Textarea
                id="internalNotes"
                value={form.internalNotes}
                onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
                placeholder="Private notes for your team"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={touched && !canSubmit}>
              {isEdit ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
