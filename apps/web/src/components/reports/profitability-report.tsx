"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, getCustomer, getOrderMarginPercent, getOrderProfit, getOrderRevenue } from "@/lib/mock-data";
import {
  getCustomerProfit,
  getDriverProfit,
  getRoutePerformanceStats,
  getVehicleProfit,
} from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import { useAppData } from "@/lib/store";
import type { Expense, Invoice, Order } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

function ProfitCell({ value }: { value: number }) {
  return (
    <TableCell
      className={value >= 0 ? "text-right font-medium text-chart-2" : "text-right font-medium text-destructive"}
    >
      {formatCurrency(value)}
    </TableCell>
  );
}

export function ProfitabilityReport({
  orders,
  expenses,
  invoices,
}: {
  orders: Order[];
  expenses: Expense[];
  invoices: Invoice[];
}) {
  const { customers, drivers, vehicles } = useAppData();
  const delivered = orders.filter((o) => o.status === "delivered");

  const byOrder = delivered
    .map((o) => ({
      order: o,
      revenue: getOrderRevenue(o, invoices),
      profit: getOrderProfit(o, expenses, invoices),
      margin: getOrderMarginPercent(o, expenses, invoices),
    }))
    .sort((a, b) => a.profit - b.profit);

  const byCustomer = customers
    .map((c) => ({ customer: c, profit: getCustomerProfit(c.id, orders, expenses, invoices) }))
    .filter((r) => r.profit !== 0)
    .sort((a, b) => b.profit - a.profit);

  const byDriver = drivers
    .map((d) => ({ driver: d, profit: getDriverProfit(d.id, orders, expenses, invoices) }))
    .filter((r) => r.profit !== 0)
    .sort((a, b) => b.profit - a.profit);

  const byVehicle = vehicles
    .map((v) => ({ vehicle: v, profit: getVehicleProfit(v.id, orders, expenses, invoices) }))
    .filter((r) => r.profit !== 0)
    .sort((a, b) => b.profit - a.profit);

  const byRoute = getRoutePerformanceStats(orders, expenses).filter((r) => r.deliveryCount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profitability Report</CardTitle>
        <CardDescription>
          Labeled as <strong>Estimated Gross Profit</strong> — indirect overhead (rent, salaries,
          admin costs) is not included.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="order">
          <TabsList>
            <TabsTrigger value="order">Order</TabsTrigger>
            <TabsTrigger value="customer">Customer</TabsTrigger>
            <TabsTrigger value="route">Route</TabsTrigger>
            <TabsTrigger value="driver">Driver</TabsTrigger>
            <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
          </TabsList>

          <TabsContent value="order" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <ExportCsvButton
                filename="profitability-by-order.csv"
                rows={byOrder.map<CsvRow>((r) => ({
                  Order: r.order.id,
                  Customer: getCustomer(r.order.customerId, customers)?.name ?? "",
                  Revenue: r.revenue,
                  "Estimated Gross Profit": r.profit,
                  "Margin %": Number(r.margin.toFixed(1)),
                }))}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Est. Gross Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byOrder.slice(0, 20).map((r) => (
                  <TableRow key={r.order.id}>
                    <TableCell className="font-medium">{r.order.id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {getCustomer(r.order.customerId, customers)?.name}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                    <ProfitCell value={r.profit} />
                    <TableCell className="text-right text-muted-foreground">
                      {r.margin.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {byOrder.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No delivered orders match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="customer" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <ExportCsvButton
                filename="profitability-by-customer.csv"
                rows={byCustomer.map<CsvRow>((r) => ({
                  Customer: r.customer.name,
                  "Estimated Gross Profit": r.profit,
                }))}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Est. Gross Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCustomer.map((r) => (
                  <TableRow key={r.customer.id}>
                    <TableCell className="font-medium">{r.customer.name}</TableCell>
                    <ProfitCell value={r.profit} />
                  </TableRow>
                ))}
                {byCustomer.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No data for the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="route" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <ExportCsvButton
                filename="profitability-by-route.csv"
                rows={byRoute.map<CsvRow>((r) => ({
                  Route: r.route,
                  "Estimated Gross Profit": r.grossProfit,
                  "Margin %": Number(r.marginPercent.toFixed(1)),
                }))}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Est. Gross Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byRoute.map((r) => (
                  <TableRow key={r.route}>
                    <TableCell className="font-medium">{r.route}</TableCell>
                    <ProfitCell value={r.grossProfit} />
                    <TableCell className="text-right text-muted-foreground">
                      {r.marginPercent.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {byRoute.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No data for the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="driver" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <ExportCsvButton
                filename="profitability-by-driver.csv"
                rows={byDriver.map<CsvRow>((r) => ({
                  Driver: r.driver.name,
                  "Estimated Gross Profit": r.profit,
                }))}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Est. Gross Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDriver.map((r) => (
                  <TableRow key={r.driver.id}>
                    <TableCell className="font-medium">{r.driver.name}</TableCell>
                    <ProfitCell value={r.profit} />
                  </TableRow>
                ))}
                {byDriver.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No data for the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="vehicle" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <ExportCsvButton
                filename="profitability-by-vehicle.csv"
                rows={byVehicle.map<CsvRow>((r) => ({
                  Vehicle: `${r.vehicle.model} (${r.vehicle.plate})`,
                  "Estimated Gross Profit": r.profit,
                }))}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Est. Gross Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byVehicle.map((r) => (
                  <TableRow key={r.vehicle.id}>
                    <TableCell className="font-medium">
                      {r.vehicle.model} · {r.vehicle.plate}
                    </TableCell>
                    <ProfitCell value={r.profit} />
                  </TableRow>
                ))}
                {byVehicle.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                      No data for the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
