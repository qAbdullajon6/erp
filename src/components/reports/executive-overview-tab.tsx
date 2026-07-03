"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/mock-data";
import { getPreviousPeriodBounds, type DateBounds } from "@/lib/date-range";
import {
  computeExecutiveStats,
  filterExpensesForReport,
  filterOrdersForReport,
  type ReportFilterState,
} from "@/lib/reports-data";
import { useAppData } from "@/lib/store";
import { ExecutiveKpiCards } from "@/components/reports/executive-kpi-cards";
import { RevenueExpenseTrendReport } from "@/components/reports/revenue-expense-trend-report";
import { OrdersByStatusChart } from "@/components/reports/orders-by-status-chart";
import { DeliveryPerformanceTrend } from "@/components/reports/delivery-performance-trend";
import { TopCustomersReportPanel } from "@/components/reports/top-customers-report-panel";
import { TopRoutesPanel } from "@/components/reports/top-routes-panel";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

export function ExecutiveOverviewTab({
  filters,
  bounds,
}: {
  filters: ReportFilterState;
  bounds: DateBounds;
}) {
  const { orders, invoices, expenses, customers } = useAppData();

  const scopedOrders = filterOrdersForReport(orders, filters, bounds);
  const scopedExpenses = filterExpensesForReport(expenses, orders, filters, bounds).filter(
    (e) => e.approvalStatus === "approved",
  );

  const previousBounds = getPreviousPeriodBounds(bounds);
  const current = computeExecutiveStats({ orders, invoices, expenses }, filters, bounds);
  const previous = computeExecutiveStats({ orders, invoices, expenses }, filters, previousBounds);

  const exportRows = [
    { Metric: "Total Orders", Value: current.totalOrders },
    { Metric: "Delivered Orders", Value: current.deliveredOrders },
    { Metric: "On-Time Delivery Rate %", Value: current.onTimeRatePercent },
    { Metric: "Delayed Deliveries", Value: current.delayedDeliveries },
    { Metric: "Revenue", Value: current.revenue },
    { Metric: "Collected Payments", Value: current.collectedPayments },
    { Metric: "Outstanding Receivables", Value: current.outstandingReceivables },
    { Metric: "Approved Expenses", Value: current.approvedExpenses },
    { Metric: "Estimated Gross Profit", Value: current.grossProfit },
    { Metric: "Gross Margin %", Value: Number(current.grossMarginPercent.toFixed(1)) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <ExportCsvButton filename="executive-overview.csv" rows={exportRows} />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
      </div>

      <div data-print-section className="space-y-4">
        <ExecutiveKpiCards current={current} previous={previous} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RevenueExpenseTrendReport
            orders={scopedOrders}
            approvedExpenseDates={scopedExpenses}
            bounds={bounds}
          />
          <OrdersByStatusChart orders={scopedOrders} />
        </div>

        <DeliveryPerformanceTrend orders={scopedOrders} bounds={bounds} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopCustomersReportPanel
            customers={customers}
            orders={scopedOrders}
            invoices={invoices}
            expenses={expenses}
          />
          <TopRoutesPanel orders={scopedOrders} expenses={expenses} />
        </div>

        <p className="text-xs text-muted-foreground">
          Print summary: {current.totalOrders} orders, {formatCurrency(current.revenue)} revenue,{" "}
          {formatCurrency(current.grossProfit)} estimated gross profit for the selected period.
        </p>
      </div>
    </div>
  );
}
