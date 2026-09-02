import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ReportsView } from "@/components/reports/reports-view";
import { ALL_STAFF_ROLES } from "@/lib/role-access";
import { asSearchString } from "@/lib/search-params";
import type { DateRangePreset } from "@/components/reports/report-date-range";

const REPORT_TABS = ["executive", "operations", "financial", "fleet"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "custom",
];

const COMPARISON_PERIODS = ["previous_period", "previous_year", "none"] as const;
export type ReportComparisonPeriod = (typeof COMPARISON_PERIODS)[number];

export type ReportsSearch = {
  tab?: ReportTab;
  preset?: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  comparisonPeriod?: ReportComparisonPeriod;
};

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [{ title: "Reports — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): ReportsSearch => {
    const tab = search.tab;
    const preset = search.preset;
    const comparisonPeriod = search.comparisonPeriod;
    return {
      tab: (REPORT_TABS as readonly unknown[]).includes(tab) ? (tab as ReportTab) : undefined,
      preset: (DATE_RANGE_PRESETS as readonly unknown[]).includes(preset)
        ? (preset as DateRangePreset)
        : undefined,
      dateFrom: asSearchString(search.dateFrom),
      dateTo: asSearchString(search.dateTo),
      comparisonPeriod: (COMPARISON_PERIODS as readonly unknown[]).includes(comparisonPeriod)
        ? (comparisonPeriod as ReportComparisonPeriod)
        : undefined,
    };
  },
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <ReportsView />
    </ProtectedApiRoute>
  );
}
