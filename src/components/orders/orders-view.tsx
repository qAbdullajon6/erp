"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate, getCustomer, isOrderDelayed } from "@/lib/mock-data";
import { delayedStatusMeta, orderStatusMeta, orderStatusOrder } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Order, OrderStatus } from "@/lib/types";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";
import { OrderDetailSheet } from "@/components/orders/order-detail-sheet";

export function OrdersView() {
  const { orders, drivers, customers } = useAppData();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<OrderStatus | "all">("all");
  const [customerFilter, setCustomerFilter] = React.useState<string>("all");
  const [selectedOrder, setSelectedOrder] = React.useState<Order | null>(null);

  const filtered = orders
    .filter((o) => (statusFilter === "all" ? true : o.status === statusFilter))
    .filter((o) => (customerFilter === "all" ? true : o.customerId === customerFilter))
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const customer = getCustomer(o.customerId, customers);
      return (
        o.id.toLowerCase().includes(q) ||
        o.origin.toLowerCase().includes(q) ||
        o.destination.toLowerCase().includes(q) ||
        o.cargo.toLowerCase().includes(q) ||
        customer?.name.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Keep the sheet's data in sync with live store updates (e.g. status changes)
  const liveSelectedOrder = selectedOrder
    ? (orders.find((o) => o.id === selectedOrder.id) ?? null)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order, customer, route..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {orderStatusOrder.map((status) => (
              <SelectItem key={status} value={status}>
                {orderStatusMeta[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Customer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="sm:ml-auto">
          <NewOrderDialog />
        </div>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const customer = getCustomer(order.customerId, customers);
                const driver = drivers.find((d) => d.id === order.driverId);
                const delayed = isOrderDelayed(order);
                const meta = orderStatusMeta[order.status];
                return (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <TableCell className="font-medium">{order.id}</TableCell>
                    <TableCell className="text-muted-foreground">{customer?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.origin} → {order.destination}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.cargo} · {order.weightTons}t
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(order.pickupDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(order.deliveryDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {driver?.name ?? "Unassigned"}
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No orders match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderDetailSheet
        order={liveSelectedOrder}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      />
    </div>
  );
}
