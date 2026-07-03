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
import { formatCurrency, getRouteProfitability } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function ProfitableRoutes() {
  const { orders, expenses } = useAppData();
  const routes = getRouteProfitability(orders, expenses).slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Profitable Routes</CardTitle>
        <CardDescription>Based on completed deliveries</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((r) => (
              <TableRow key={r.route}>
                <TableCell className="font-medium">{r.route}</TableCell>
                <TableCell className="text-right">{r.orderCount}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                <TableCell
                  className={
                    r.profit >= 0
                      ? "text-right font-medium text-chart-2"
                      : "text-right font-medium text-destructive"
                  }
                >
                  {formatCurrency(r.profit)}
                </TableCell>
              </TableRow>
            ))}
            {routes.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No completed deliveries yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
