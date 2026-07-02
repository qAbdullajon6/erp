"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatDate,
  getCustomerInvoices,
  getCustomerOrders,
  getInvoiceRemaining,
  getInvoiceStatus,
  isOrderDelayed,
} from "@/lib/mock-data";
import { delayedStatusMeta, invoiceStatusMeta, orderStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Customer } from "@/lib/types";

export function CustomerDetailSheet({
  customer,
  onOpenChange,
}: {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { orders, invoices } = useAppData();

  if (!customer) return null;

  const customerOrders = getCustomerOrders(customer.id, orders);
  const customerInvoices = getCustomerInvoices(customer.id, invoices);
  const unpaidInvoices = customerInvoices.filter((i) => getInvoiceStatus(i) !== "paid");

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{customer.name}</SheetTitle>
          <SheetDescription>
            {customer.industry} · {customer.city}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
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
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd className="font-medium">{customer.address}</dd>
            </div>
            <div className="col-span-2">
              <dt className="mb-1 text-xs text-muted-foreground">Usual routes</dt>
              <dd className="flex flex-wrap gap-1.5">
                {customer.usualRoutes.map((route) => (
                  <Badge key={route} variant="outline">
                    {route}
                  </Badge>
                ))}
              </dd>
            </div>
            {customer.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="font-medium">{customer.notes}</dd>
              </div>
            )}
          </dl>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Order history ({customerOrders.length})
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerOrders.map((order) => {
                  const meta = orderStatusMeta[order.status];
                  const delayed = isOrderDelayed(order);
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {order.origin} → {order.destination}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={meta.badgeClass}>
                            {meta.label}
                          </Badge>
                          {delayed && (
                            <Badge variant="outline" className={delayedStatusMeta.badgeClass}>
                              {delayedStatusMeta.label}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {customerOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No orders yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Unpaid invoices ({unpaidInvoices.length})
            </p>
            {unpaidInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
            )}
            <div className="space-y-2">
              {unpaidInvoices.map((inv) => {
                const status = getInvoiceStatus(inv);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{inv.id}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDate(inv.dueAt)}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={invoiceStatusMeta[status].badgeClass}>
                        {invoiceStatusMeta[status].label}
                      </Badge>
                      <p className="mt-1 font-medium">
                        {formatCurrency(getInvoiceRemaining(inv))} due
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
