"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, getCustomer } from "@/lib/mock-data";
import { expenseCategoryMeta } from "@/lib/status-meta";
import { getExpenseBreakdownBy, routeLabel, type BreakdownRow } from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import { useAppData } from "@/lib/store";
import type { Expense, Order } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

function BreakdownTable({ rows, filename }: { rows: BreakdownRow[]; filename: string }) {
  const exportRows: CsvRow[] = rows.map((r) => ({ Key: r.key, Amount: r.amount, Count: r.count }));
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportCsvButton filename={filename} rows={exportRows} label="Export" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Breakdown</TableHead>
            <TableHead className="text-right">Expenses</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right">{r.count}</TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(r.amount)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                No approved expenses match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function ExpenseBreakdownReport({
  expenses,
  orders,
}: {
  expenses: Expense[];
  orders: Order[];
}) {
  const { vehicles, drivers, customers } = useAppData();

  const byCategory = getExpenseBreakdownBy(expenses, (e) => expenseCategoryMeta[e.category].label);
  const byVehicle = getExpenseBreakdownBy(expenses, (e) => {
    const v = vehicles.find((veh) => veh.id === e.vehicleId);
    return v ? `${v.model} · ${v.plate}` : undefined;
  });
  const byDriver = getExpenseBreakdownBy(expenses, (e) => drivers.find((d) => d.id === e.driverId)?.name);
  const byRoute = getExpenseBreakdownBy(expenses, (e) => {
    const order = orders.find((o) => o.id === e.orderId);
    return order ? routeLabel(order) : undefined;
  });
  const byCustomer = getExpenseBreakdownBy(expenses, (e) => {
    const order = orders.find((o) => o.id === e.orderId);
    return order ? getCustomer(order.customerId, customers)?.name : undefined;
  });

  return (
    <Card>
      <CardContent>
        <Tabs defaultValue="category">
          <TabsList>
            <TabsTrigger value="category">Category</TabsTrigger>
            <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
            <TabsTrigger value="driver">Driver</TabsTrigger>
            <TabsTrigger value="route">Route</TabsTrigger>
            <TabsTrigger value="customer">Customer/Order</TabsTrigger>
          </TabsList>
          <TabsContent value="category" className="mt-4">
            <BreakdownTable rows={byCategory} filename="expenses-by-category.csv" />
          </TabsContent>
          <TabsContent value="vehicle" className="mt-4">
            <BreakdownTable rows={byVehicle} filename="expenses-by-vehicle.csv" />
          </TabsContent>
          <TabsContent value="driver" className="mt-4">
            <BreakdownTable rows={byDriver} filename="expenses-by-driver.csv" />
          </TabsContent>
          <TabsContent value="route" className="mt-4">
            <BreakdownTable rows={byRoute} filename="expenses-by-route.csv" />
          </TabsContent>
          <TabsContent value="customer" className="mt-4">
            <BreakdownTable rows={byCustomer} filename="expenses-by-customer.csv" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
