"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveDateRange, type DateRangeOption } from "@/lib/date-range";
import { getReferenceNow } from "@/lib/mock-data";
import { defaultReportFilters, type ReportFilterState } from "@/lib/reports-data";
import type { CustomRange } from "@/components/finance/date-range-filter";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExecutiveOverviewTab } from "@/components/reports/executive-overview-tab";
import { OperationsTab } from "@/components/reports/operations-tab";
import { FinancialTab } from "@/components/reports/financial-tab";
import { useRole } from "@/lib/role";
import { visibleReportTabs } from "@/lib/permissions";

function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ReportsView() {
  const now = getReferenceNow();
  const { role } = useRole();
  const tabs = visibleReportTabs(role);
  const [dateOption, setDateOption] = React.useState<DateRangeOption>("this_month");
  const [custom, setCustom] = React.useState<CustomRange>(() => ({
    start: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toDateInput(now),
  }));
  const [filters, setFilters] = React.useState<ReportFilterState>(defaultReportFilters);

  const bounds = resolveDateRange(dateOption, now, custom);

  return (
    <div className="space-y-4">
      <ReportFilters
        dateOption={dateOption}
        onDateOptionChange={setDateOption}
        custom={custom}
        onCustomChange={setCustom}
        filters={filters}
        onFiltersChange={setFilters}
        onReset={() => {
          setDateOption("this_month");
          setFilters(defaultReportFilters);
        }}
      />

      <Tabs defaultValue={tabs[0]}>
        <TabsList>
          {tabs.includes("executive") && <TabsTrigger value="executive">Executive Overview</TabsTrigger>}
          {tabs.includes("operations") && <TabsTrigger value="operations">Operations</TabsTrigger>}
          {tabs.includes("financial") && <TabsTrigger value="financial">Financial</TabsTrigger>}
        </TabsList>

        {tabs.includes("executive") && (
          <TabsContent value="executive" className="mt-4">
            <ExecutiveOverviewTab filters={filters} bounds={bounds} />
          </TabsContent>
        )}
        {tabs.includes("operations") && (
          <TabsContent value="operations" className="mt-4">
            <OperationsTab filters={filters} bounds={bounds} />
          </TabsContent>
        )}
        {tabs.includes("financial") && (
          <TabsContent value="financial" className="mt-4">
            <FinancialTab filters={filters} bounds={bounds} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
