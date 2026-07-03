"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, getCustomer } from "@/lib/mock-data";
import { getOrderExceptions } from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import { useAppData } from "@/lib/store";
import type { Order } from "@/lib/types";
import { OrderDetailSheet } from "@/components/orders/order-detail-sheet";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

function ExceptionTable({
  title,
  description,
  orders,
  onSelect,
  filename,
}: {
  title: string;
  description: string;
  orders: Order[];
  onSelect: (order: Order) => void;
  filename: string;
}) {
  const { customers } = useAppData();
  const exportRows: CsvRow[] = orders.map((o) => ({
    Order: o.id,
    Customer: getCustomer(o.customerId, customers)?.name ?? "",
    Route: `${o.origin} → ${o.destination}`,
    Status: o.status,
    Amount: o.amount,
    Created: o.createdAt,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <ExportCsvButton filename={filename} rows={exportRows} label="Export" />
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">None right now.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const customer = getCustomer(o.customerId, customers);
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => onSelect(o)}>
                    <TableCell className="font-medium">{o.id}</TableCell>
                    <TableCell className="text-muted-foreground">{customer?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.origin} → {o.destination}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(o.amount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function OrderExceptionsReport({ orders }: { orders: Order[] }) {
  const { orders: liveOrders, invoices, expenses } = useAppData();
  const [selected, setSelected] = React.useState<Order | null>(null);
  const exceptions = getOrderExceptions(orders, expenses, invoices);
  const liveSelected = selected ? (liveOrders.find((o) => o.id === selected.id) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExceptionTable
          title="Delayed"
          description="Overdue or currently running late"
          orders={exceptions.delayed}
          onSelect={setSelected}
          filename="exceptions-delayed.csv"
        />
        <ExceptionTable
          title="Unassigned"
          description="Pending with no driver assigned"
          orders={exceptions.unassigned}
          onSelect={setSelected}
          filename="exceptions-unassigned.csv"
        />
        <ExceptionTable
          title="Cancelled"
          description="Cancelled within the active filters"
          orders={exceptions.cancelled}
          onSelect={setSelected}
          filename="exceptions-cancelled.csv"
        />
        <ExceptionTable
          title="Negative Profit"
          description="Delivered at a loss (approved expenses exceed revenue)"
          orders={exceptions.negativeProfit}
          onSelect={setSelected}
          filename="exceptions-negative-profit.csv"
        />
        <ExceptionTable
          title="Delivered Without Invoice"
          description="Delivered but no invoice was ever generated"
          orders={exceptions.deliveredWithoutInvoice}
          onSelect={setSelected}
          filename="exceptions-no-invoice.csv"
        />
      </div>

      <OrderDetailSheet
        order={liveSelected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
