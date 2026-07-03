"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DateBounds } from "@/lib/date-range";
import { filterOrdersForReport, filterExpensesForReport, type ReportFilterState } from "@/lib/reports-data";
import { useAppData } from "@/lib/store";
import { DriverPerformanceReport } from "@/components/reports/driver-performance-report";
import { VehicleUtilizationReport } from "@/components/reports/vehicle-utilization-report";
import { RoutePerformanceReport } from "@/components/reports/route-performance-report";
import { OrderExceptionsReport } from "@/components/reports/order-exceptions-report";

export function OperationsTab({
  filters,
  bounds,
}: {
  filters: ReportFilterState;
  bounds: DateBounds;
}) {
  const { orders, drivers, vehicles, expenses } = useAppData();
  const scopedOrders = filterOrdersForReport(orders, filters, bounds);
  const scopedExpenses = filterExpensesForReport(expenses, orders, filters, bounds);

  return (
    <Tabs defaultValue="drivers">
      <TabsList>
        <TabsTrigger value="drivers">Drivers</TabsTrigger>
        <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
        <TabsTrigger value="routes">Routes</TabsTrigger>
        <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
      </TabsList>

      <TabsContent value="drivers" className="mt-4">
        <DriverPerformanceReport drivers={drivers} orders={scopedOrders} />
      </TabsContent>
      <TabsContent value="vehicles" className="mt-4">
        <VehicleUtilizationReport
          vehicles={vehicles}
          orders={scopedOrders}
          expenses={scopedExpenses}
        />
      </TabsContent>
      <TabsContent value="routes" className="mt-4">
        <RoutePerformanceReport orders={scopedOrders} expenses={scopedExpenses} />
      </TabsContent>
      <TabsContent value="exceptions" className="mt-4">
        <OrderExceptionsReport orders={scopedOrders} />
      </TabsContent>
    </Tabs>
  );
}
