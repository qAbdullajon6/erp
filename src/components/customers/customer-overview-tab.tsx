"use client";

import { FilePlus, PackagePlus, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatDate,
  getCustomerLifetimeValue,
  getCustomerOutstandingBalance,
  getCustomerOverdueBalance,
  getLastOrderDate,
} from "@/lib/mock-data";
import { paymentTermsMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import { useRole } from "@/lib/role";
import { hasCapability } from "@/lib/permissions";
import type { Customer } from "@/lib/types";

export function CustomerOverviewTab({
  customer,
  onEdit,
  onCreateOrder,
  onCreateInvoice,
  onGoToInvoices,
}: {
  customer: Customer;
  onEdit: () => void;
  onCreateOrder: () => void;
  onCreateInvoice: () => void;
  onGoToInvoices: () => void;
}) {
  const { orders, invoices } = useAppData();
  const { role } = useRole();
  const canCreateOrder = hasCapability(role, "create_order");
  const canManageFinanceConfig = hasCapability(role, "manage_finance_config");
  const canRecordPayments = hasCapability(role, "record_payments");
  const canManageCustomers = hasCapability(role, "manage_customers");

  const totalRevenue = getCustomerLifetimeValue(customer.id, orders);
  const outstanding = getCustomerOutstandingBalance(customer.id, invoices);
  const overdue = getCustomerOverdueBalance(customer.id, invoices);
  const usedCredit = outstanding;
  const availableCredit = customer.creditLimit - usedCredit;
  const lastOrderDate = getLastOrderDate(customer.id, orders);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {canCreateOrder && (
          <Button size="sm" onClick={onCreateOrder} className="gap-1.5">
            <PackagePlus className="size-3.5" />
            Create Order
          </Button>
        )}
        {canManageFinanceConfig && (
          <Button size="sm" variant="outline" onClick={onCreateInvoice} className="gap-1.5">
            <FilePlus className="size-3.5" />
            Create Invoice
          </Button>
        )}
        {canRecordPayments && (
          <Button size="sm" variant="outline" onClick={onGoToInvoices} className="gap-1.5">
            <Wallet className="size-3.5" />
            Record Payment
          </Button>
        )}
        {canManageCustomers && (
          <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
            <Pencil className="size-3.5" />
            Edit Customer
          </Button>
        )}
      </div>

      <Separator />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Contact person</dt>
          <dd className="font-medium">{customer.contactPerson}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Phone</dt>
          <dd className="font-medium">{customer.phone}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="font-medium">{customer.email}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Billing address</dt>
          <dd className="font-medium">
            {customer.address}, {customer.city}, {customer.country}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tax ID</dt>
          <dd className="font-medium">{customer.taxId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Payment terms</dt>
          <dd className="font-medium">{paymentTermsMeta[customer.paymentTerms].label}</dd>
        </div>
        {customer.usualRoutes.length > 0 && (
          <div className="col-span-2">
            <dt className="mb-1 text-xs text-muted-foreground">Usual routes</dt>
            <dd className="text-sm">{customer.usualRoutes.join(" · ")}</dd>
          </div>
        )}
        {customer.deliveryNotes && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Delivery notes</dt>
            <dd className="font-medium">{customer.deliveryNotes}</dd>
          </div>
        )}
        {customer.internalNotes && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Internal notes</dt>
            <dd className="font-medium">{customer.internalNotes}</dd>
          </div>
        )}
      </dl>

      <Separator />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Credit limit</dt>
          <dd className="font-medium">{formatCurrency(customer.creditLimit)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Used credit</dt>
          <dd className="font-medium">{formatCurrency(usedCredit)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Available credit</dt>
          <dd className={availableCredit < 0 ? "font-medium text-destructive" : "font-medium"}>
            {formatCurrency(availableCredit)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last order</dt>
          <dd className="font-medium">{lastOrderDate ? formatDate(lastOrderDate) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total revenue</dt>
          <dd className="font-medium text-chart-2">{formatCurrency(totalRevenue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Outstanding balance</dt>
          <dd className={outstanding > 0 ? "font-medium text-chart-3" : "font-medium"}>
            {formatCurrency(outstanding)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Overdue balance</dt>
          <dd className={overdue > 0 ? "font-medium text-destructive" : "font-medium"}>
            {formatCurrency(overdue)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
