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
import { formatCurrency, getVehicleExpenseTotal, getVehicleRevenue } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function VehiclePerformanceTable() {
  const { vehicles, orders, expenses } = useAppData();

  const rows = vehicles
    .map((v) => {
      const revenue = getVehicleRevenue(v.id, orders);
      const cost = getVehicleExpenseTotal(v.id, expenses);
      return { vehicle: v, revenue, cost, profit: revenue - cost };
    })
    .sort((a, b) => b.profit - a.profit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle Revenue & Expense</CardTitle>
        <CardDescription>Ranked by profit contribution</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ vehicle, revenue, cost, profit }) => (
              <TableRow key={vehicle.id}>
                <TableCell className="font-medium">
                  {vehicle.model} · {vehicle.plate}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(revenue)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatCurrency(cost)}
                </TableCell>
                <TableCell
                  className={
                    profit >= 0
                      ? "text-right font-medium text-chart-2"
                      : "text-right font-medium text-destructive"
                  }
                >
                  {formatCurrency(profit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
