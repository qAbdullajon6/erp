"use client";

import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatRelativeTime, getCustomer, isOrderDelayed } from "@/lib/mock-data";
import { delayedStatusMeta, orderStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

export function RecentOrdersTable() {
  const { orders, drivers } = useAppData();

  const recent = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
        <CardDescription>Latest shipments across your network</CardDescription>
        <CardAction>
          <Link href="/orders" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((order) => {
              const customer = getCustomer(order.customerId);
              const driver = drivers.find((d) => d.id === order.driverId);
              const delayed = isOrderDelayed(order);
              const meta = orderStatusMeta[order.status];
              return (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell className="text-muted-foreground">{customer?.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.origin} → {order.destination}
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
                  <TableCell className="text-right text-muted-foreground">
                    {formatRelativeTime(order.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
