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
