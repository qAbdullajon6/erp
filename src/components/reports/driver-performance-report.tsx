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
import { getDriverPerformanceStats } from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import type { Driver, Order } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

export function DriverPerformanceReport({
  drivers,
  orders,
}: {
  drivers: Driver[];
  orders: Order[];
}) {
  const stats = drivers
    .map((d) => getDriverPerformanceStats(d, orders))
    .sort((a, b) => b.onTimeRate - a.onTimeRate);

  const exportRows: CsvRow[] = stats.map((s) => ({
    Driver: s.driver.name,
    "Total assignments": s.totalAssignments,
    Delivered: s.deliveredCount,
    "On-time rate %": s.onTimeRate,
    "Delayed deliveries": s.delayedCount,
    Cancelled: s.cancelledCount,
    "Revenue contribution": s.revenueContribution,
  }));

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <ExportCsvButton filename="driver-performance.csv" rows={exportRows} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Assignments</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">On-time</TableHead>
              <TableHead className="text-right">Delayed</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((s) => (
              <TableRow key={s.driver.id}>
                <TableCell className="font-medium">{s.driver.name}</TableCell>
                <TableCell className="text-right">{s.totalAssignments}</TableCell>
                <TableCell className="text-right">{s.deliveredCount}</TableCell>
                <TableCell className="text-right">{s.onTimeRate}%</TableCell>
                <TableCell
                  className={
                    s.delayedCount > 0
                      ? "text-right text-destructive"
                      : "text-right text-muted-foreground"
                  }
                >
                  {s.delayedCount}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {s.cancelledCount}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(s.revenueContribution)}
                </TableCell>
              </TableRow>
            ))}
            {stats.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No drivers match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
