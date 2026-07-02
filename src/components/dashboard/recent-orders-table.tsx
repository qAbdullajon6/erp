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
import { formatCurrency, formatRelativeTime, getCustomer, getDriver, orders } from "@/lib/mock-data";
import type { OrderStatus } from "@/lib/types";

const statusBadge: Record<OrderStatus, string> = {
  pending: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  assigned: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  in_transit: "bg-primary/10 text-primary border-primary/20",
  delivered: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  delayed: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-transparent",
};

const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

const recent = [...orders]
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .slice(0, 8);

export function RecentOrdersTable() {
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
              const driver = getDriver(order.driverId);
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
                    <Badge variant="outline" className={statusBadge[order.status]}>
                      {statusLabel[order.status]}
                    </Badge>
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
