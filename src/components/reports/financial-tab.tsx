"use client";

import type { DateBounds } from "@/lib/date-range";
import {
  filterExpensesForReport,
  filterInvoicesForReport,
  filterOrdersForReport,
  type ReportFilterState,
} from "@/lib/reports-data";
import { useAppData } from "@/lib/store";
import { ReceivablesAgingReport } from "@/components/reports/receivables-aging-report";
import { InvoiceCollectionReport } from "@/components/reports/invoice-collection-report";
import { ExpenseBreakdownReport } from "@/components/reports/expense-breakdown-report";
import { ProfitabilityReport } from "@/components/reports/profitability-report";

export function FinancialTab({
  filters,
  bounds,
}: {
  filters: ReportFilterState;
  bounds: DateBounds;
}) {
  const { orders, invoices, expenses } = useAppData();

  const scopedOrders = filterOrdersForReport(orders, filters, bounds);
  const currentInvoices = filterInvoicesForReport(invoices, orders, filters);
  const periodInvoices = filterInvoicesForReport(invoices, orders, filters, bounds);
  const approvedExpenses = filterExpensesForReport(expenses, orders, filters, bounds).filter(
    (e) => e.approvalStatus === "approved",
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ReceivablesAgingReport invoices={currentInvoices} />
      <InvoiceCollectionReport invoices={periodInvoices} />
      <div className="lg:col-span-2">
        <ExpenseBreakdownReport expenses={approvedExpenses} orders={orders} />
      </div>
      <div className="lg:col-span-2">
        <ProfitabilityReport orders={scopedOrders} expenses={approvedExpenses} invoices={invoices} />
      </div>
    </div>
  );
}
