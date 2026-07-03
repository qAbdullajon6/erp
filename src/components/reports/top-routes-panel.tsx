"use client";

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
import { formatCurrency } from "@/lib/mock-data";
import { getRoutePerformanceStats } from "@/lib/reports-data";
import type { Expense, Order } from "@/lib/types";

export function TopRoutesPanel({
  orders,
  expenses,
}: {
  orders: Order[];
  expenses: Expense[];
}) {
  const routes = getRoutePerformanceStats(orders, expenses).slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top Routes</CardTitle>
        <CardDescription>By revenue, within the active filters</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Deliveries</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">Delay rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((r) => (
              <TableRow key={r.route}>
                <TableCell className="font-medium">{r.route}</TableCell>
                <TableCell className="text-right">{r.deliveryCount}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                <TableCell
                  className={
                    r.grossProfit >= 0
                      ? "text-right font-medium text-chart-2"
                      : "text-right font-medium text-destructive"
                  }
                >
                  {formatCurrency(r.grossProfit)}
                </TableCell>
                <TableCell
                  className={
                    r.delayRatePercent > 0
                      ? "text-right text-destructive"
                      : "text-right text-muted-foreground"
                  }
                >
                  {r.delayRatePercent.toFixed(0)}%
                </TableCell>
              </TableRow>
            ))}
            {routes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No routes match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
