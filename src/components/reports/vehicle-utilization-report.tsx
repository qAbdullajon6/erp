"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";
import { vehicleStatusMeta } from "@/lib/status-meta";
import { getVehicleUtilizationStats } from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import type { Expense, Order, Vehicle } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

export function VehicleUtilizationReport({
  vehicles,
  orders,
  expenses,
}: {
  vehicles: Vehicle[];
  orders: Order[];
  expenses: Expense[];
}) {
  const stats = vehicles
    .map((v) => getVehicleUtilizationStats(v, orders, expenses))
    .sort((a, b) => b.revenueContribution - a.revenueContribution);

  const exportRows: CsvRow[] = stats.map((s) => ({
    Vehicle: `${s.vehicle.model} (${s.vehicle.plate})`,
    Assignments: s.assignments,
    Delivered: s.deliveredCount,
    Availability: vehicleStatusMeta[s.vehicle.status].label,
    "Revenue contribution": s.revenueContribution,
    "Approved expenses": s.approvedExpenses,
  }));

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <ExportCsvButton filename="vehicle-utilization.csv" rows={exportRows} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead className="text-right">Assignments</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Approved expenses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((s) => (
              <TableRow key={s.vehicle.id}>
                <TableCell className="font-medium">
                  {s.vehicle.model} · {s.vehicle.plate}
                </TableCell>
                <TableCell className="text-right">{s.assignments}</TableCell>
                <TableCell className="text-right">{s.deliveredCount}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={vehicleStatusMeta[s.vehicle.status].badgeClass}
                  >
                    {vehicleStatusMeta[s.vehicle.status].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(s.revenueContribution)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatCurrency(s.approvedExpenses)}
                </TableCell>
              </TableRow>
            ))}
            {stats.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No vehicles match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
