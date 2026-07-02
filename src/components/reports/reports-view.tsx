import { ReportsSummary } from "@/components/reports/reports-summary";
import { RevenueByCustomer } from "@/components/reports/revenue-by-customer";
import { UnpaidInvoicesSummary } from "@/components/reports/unpaid-invoices-summary";
import { DriverPerformanceTable } from "@/components/reports/driver-performance-table";
import { VehiclePerformanceTable } from "@/components/reports/vehicle-performance-table";
import { ProfitableRoutes } from "@/components/reports/profitable-routes";

export function ReportsView() {
  return (
    <div className="space-y-4">
      <ReportsSummary />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueByCustomer />
        </div>
        <UnpaidInvoicesSummary />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DriverPerformanceTable />
        <VehiclePerformanceTable />
      </div>

      <ProfitableRoutes />
    </div>
  );
}
