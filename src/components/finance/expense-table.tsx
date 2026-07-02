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
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { expenseCategoryMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

export function ExpenseTable() {
  const { expenses, vehicles, drivers } = useAppData();

  const sorted = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Vehicle / Driver</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((e) => {
              const vehicle = vehicles.find((v) => v.id === e.vehicleId);
              const driver = drivers.find((d) => d.id === e.driverId);
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{formatDate(e.date)}</TableCell>
                  <TableCell className="font-medium">
                    {expenseCategoryMeta[e.category].label}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(e.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.orderId ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[vehicle?.plate, driver?.name].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.notes ?? "—"}</TableCell>
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No expenses recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
