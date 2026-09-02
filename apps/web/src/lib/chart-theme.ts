import type { ChartConfig } from "@/components/ui/chart";

/// Shared recharts/ChartContainer config so every dashboard/report chart gets
/// the same tooltip, legend, and axis treatment instead of each chart
/// hand-rolling its own `contentStyle`/gradients. Colors map to the validated
/// --series-*/--chart-* tokens in styles.css, not ad-hoc hex values.
export const revenueExpensesChartConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "var(--color-series-revenue)" },
  expenses: { label: "Expenses", color: "var(--color-series-expenses)" },
};

export const chartTooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

export const chartAxisTickStyle = {
  fontSize: 11,
  fill: "var(--color-muted-foreground)",
} as const;

export const dispatchAnalyticsChartConfig: ChartConfig = {
  dispatches: { label: "Dispatches", color: "var(--color-brand)" },
  volume: { label: "Volume", color: "var(--color-series-revenue)" },
  workload: { label: "Active", color: "var(--color-chart-3)" },
  utilization: { label: "Utilization", color: "var(--color-chart-4)" },
  delays: { label: "Delayed", color: "var(--color-warning)" },
  statusDraft: { label: "Draft", color: "var(--color-muted-foreground)" },
  statusAssigned: { label: "Assigned", color: "var(--color-brand)" },
  statusEnRoute: { label: "En route", color: "var(--color-chart-3)" },
  statusInTransit: { label: "In transit", color: "var(--color-chart-4)" },
  statusDelivered: { label: "Delivered", color: "var(--color-success)" },
  statusCancelled: { label: "Cancelled", color: "var(--color-destructive)" },
};
