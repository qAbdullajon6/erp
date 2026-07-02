"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, getCustomerOrders, isOrderDelayed } from "@/lib/mock-data";
import { delayedStatusMeta, orderStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Order } from "@/lib/types";
import { OrderDetailSheet } from "@/components/orders/order-detail-sheet";

export function CustomerOrdersTab({ customerId }: { customerId: string }) {
  const { orders, drivers } = useAppData();
  const [selected, setSelected] = React.useState<Order | null>(null);

  const customerOrders = getCustomerOrders(customerId, orders);
  const liveSelected = selected ? (orders.find((o) => o.id === selected.id) ?? null) : null;

  if (customerOrders.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Route</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customerOrders.map((order) => {
            const driver = drivers.find((d) => d.id === order.driverId);
            const delayed = isOrderDelayed(order);
            const meta = orderStatusMeta[order.status];
            return (
              <TableRow key={order.id} className="cursor-pointer" onClick={() => setSelected(order)}>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell className="text-muted-foreground">
                  {order.origin} → {order.destination}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(order.createdAt)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(order.amount)}
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <OrderDetailSheet
        order={liveSelected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
