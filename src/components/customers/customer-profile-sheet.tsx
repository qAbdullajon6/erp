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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customerStatusMeta } from "@/lib/status-meta";
import type { Customer } from "@/lib/types";
import { CustomerOverviewTab } from "@/components/customers/customer-overview-tab";
import { CustomerOrdersTab } from "@/components/customers/customer-orders-tab";
import { CustomerInvoicesTab } from "@/components/customers/customer-invoices-tab";
import { CustomerActivityTab } from "@/components/customers/customer-activity-tab";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { ArchiveCustomerDialog } from "@/components/customers/archive-customer-dialog";
import { InvoiceFormDialog } from "@/components/finance/invoice-form-dialog";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";

export function CustomerProfileSheet({
  customer,
  onOpenChange,
}: {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = React.useState("overview");
  const [showNewOrder, setShowNewOrder] = React.useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = React.useState(false);
  const [showEdit, setShowEdit] = React.useState(false);
  const [showArchive, setShowArchive] = React.useState(false);

  if (!customer) return null;

  const meta = customerStatusMeta[customer.status];

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {customer.name}
            <Badge variant="outline" className={meta.badgeClass}>
              {meta.label}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            {customer.industry} · {customer.city}, {customer.country}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowArchive(true)}>
              {customer.status === "archived" ? "Restore Customer" : "Archive Customer"}
            </Button>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="orders">Orders History</TabsTrigger>
              <TabsTrigger value="invoices">Invoices & Payments</TabsTrigger>
              <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <CustomerOverviewTab
                customer={customer}
                onEdit={() => setShowEdit(true)}
                onCreateOrder={() => setShowNewOrder(true)}
                onCreateInvoice={() => setShowCreateInvoice(true)}
                onGoToInvoices={() => setTab("invoices")}
              />
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              <CustomerOrdersTab customerId={customer.id} />
            </TabsContent>

            <TabsContent value="invoices" className="mt-4">
              <CustomerInvoicesTab customerId={customer.id} />
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <CustomerActivityTab customer={customer} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>

      {showNewOrder && (
        <NewOrderDialog
          open={showNewOrder}
          onOpenChange={setShowNewOrder}
          defaultCustomerId={customer.id}
          hideTrigger
        />
      )}
      {showCreateInvoice && (
        <InvoiceFormDialog customerId={customer.id} onOpenChange={setShowCreateInvoice} />
      )}
      {showEdit && <CustomerFormDialog customer={customer} onOpenChange={setShowEdit} />}
      {showArchive && <ArchiveCustomerDialog customer={customer} onOpenChange={setShowArchive} />}
    </Sheet>
  );
}
