"use client";

import { Card, CardContent } from "@/components/ui/card";
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
import type { CsvRow } from "@/lib/csv-export";
import type { Expense, Order } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

export function RoutePerformanceReport({
  orders,
  expenses,
}: {
  orders: Order[];
  expenses: Expense[];
}) {
  const stats = getRoutePerformanceStats(orders, expenses);

  const exportRows: CsvRow[] = stats.map((s) => ({
    Route: s.route,
    "Total orders": s.totalOrders,
    Deliveries: s.deliveryCount,
    "Avg delivery duration (h)": s.avgDeliveryDurationHours?.toFixed(1) ?? "n/a",
    "Delay rate %": s.delayRatePercent.toFixed(1),
    Revenue: s.revenue,
    Expenses: s.expenses,
    "Gross profit": s.grossProfit,
    "Margin %": s.marginPercent.toFixed(1),
  }));

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <ExportCsvButton filename="route-performance.csv" rows={exportRows} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Deliveries</TableHead>
              <TableHead className="text-right">Avg duration</TableHead>
              <TableHead className="text-right">Delay rate</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Gross profit</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((s) => (
              <TableRow key={s.route}>
                <TableCell className="font-medium">{s.route}</TableCell>
                <TableCell className="text-right">{s.deliveryCount}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {s.avgDeliveryDurationHours !== null
                    ? `${s.avgDeliveryDurationHours.toFixed(1)}h`
                    : "n/a"}
                </TableCell>
                <TableCell
                  className={
                    s.delayRatePercent > 0
                      ? "text-right text-destructive"
                      : "text-right text-muted-foreground"
                  }
                >
                  {s.delayRatePercent.toFixed(0)}%
                </TableCell>
                <TableCell className="text-right">{formatCurrency(s.revenue)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatCurrency(s.expenses)}
                </TableCell>
                <TableCell
                  className={
                    s.grossProfit >= 0
                      ? "text-right font-medium text-chart-2"
                      : "text-right font-medium text-destructive"
                  }
                >
                  {formatCurrency(s.grossProfit)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {s.marginPercent.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
            {stats.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
