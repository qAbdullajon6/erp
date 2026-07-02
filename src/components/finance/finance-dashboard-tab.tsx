"use client";

import * as React from "react";
import { resolveDateRange, type DateRangeOption } from "@/lib/date-range";
import { getReferenceNow } from "@/lib/mock-data";
import { DateRangeFilter, type CustomRange } from "@/components/finance/date-range-filter";
import { FinanceDashboardSummary } from "@/components/finance/finance-dashboard-summary";
import { RevenueExpensesChart } from "@/components/finance/revenue-expenses-chart";
import { CashCollectionChart } from "@/components/finance/cash-collection-chart";
import { RecentFinancialActivity } from "@/components/finance/recent-financial-activity";
import { OverdueInvoicesPanel } from "@/components/finance/overdue-invoices-panel";
import { TopCustomersPanel } from "@/components/finance/top-customers-panel";
import { ProfitableRoutes } from "@/components/reports/profitable-routes";

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function FinanceDashboardTab() {
  const now = getReferenceNow();
  const [option, setOption] = React.useState<DateRangeOption>("this_month");
  const [custom, setCustom] = React.useState<CustomRange>(() => ({
    start: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toDateInput(now),
  }));

  const bounds = resolveDateRange(option, now, custom);

  return (
    <div className="space-y-4">
      <DateRangeFilter
        option={option}
        onOptionChange={setOption}
        custom={custom}
        onCustomChange={setCustom}
      />

      <FinanceDashboardSummary bounds={bounds} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueExpensesChart bounds={bounds} />
        <CashCollectionChart bounds={bounds} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentFinancialActivity />
        </div>
        <OverdueInvoicesPanel />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopCustomersPanel />
        <ProfitableRoutes />
      </div>
    </div>
  );
}
