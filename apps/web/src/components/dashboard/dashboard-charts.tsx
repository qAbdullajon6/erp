import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import { chartAxisTickStyle, revenueExpensesChartConfig } from "@/lib/chart-theme";
import type { DashboardSummary } from "@/lib/api/dashboard";

interface DashboardChartsProps {
  data: DashboardSummary | null;
  loading: boolean;
}

const ordersChartConfig: ChartConfig = {
  orders: { label: "Orders", color: "var(--color-brand)" },
};

/// Fixed chart height — keeps the card at a predictable, compact size (~300px
/// total) and prevents aspect-video from inflating the chart to card-width × 9/16.
const CHART_H = "h-[180px]";

export function DashboardCharts({ data, loading }: DashboardChartsProps) {
  if (loading) {
    return <Skeleton className="h-[300px] w-full rounded-2xl" />;
  }

  if (!data) return null;

  const currency = data.currency ?? "USD";
  const money = (value: number) => formatMoney(value, currency);

  const ordersTimeSeries = data.ordersTimeSeries ?? [];
  const revenueVsExpensesTimeSeries = data.revenueVsExpensesTimeSeries ?? [];

  const hasOrders = ordersTimeSeries.some((b) => b.orders > 0);
  const hasRevenue = revenueVsExpensesTimeSeries.some((b) => b.revenue > 0);
  const hasExpenses = revenueVsExpensesTimeSeries.some((b) => b.expenses > 0);

  return (
    <SurfaceCard className="p-4">
      <div className="mb-2.5">
        <h3 className="text-sm font-semibold text-foreground">Trends</h3>
        <p className="text-[11px] text-muted-foreground">Last 30 days</p>
      </div>

      <Tabs defaultValue="orders" className="pb-1">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-3">
          {hasOrders ? (
            <ChartContainer config={ordersChartConfig} className={`${CHART_H} w-full`}>
              <BarChart data={ordersTimeSeries} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border)"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tick={chartAxisTickStyle}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  tick={chartAxisTickStyle}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="orders" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyChart message="No orders in this period" />
          )}
        </TabsContent>

        <TabsContent value="revenue" className="mt-3">
          {hasRevenue ? (
            <ChartContainer config={revenueExpensesChartConfig} className={`${CHART_H} w-full`}>
              <AreaChart
                data={revenueVsExpensesTimeSeries}
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashboardRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-series-revenue)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-series-revenue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border)"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tick={chartAxisTickStyle}
                />
                <YAxis tickLine={false} axisLine={false} width={52} tick={chartAxisTickStyle} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-series-revenue)"
                  fill="url(#dashboardRevenueFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <EmptyChart message="No revenue in this period" />
          )}
        </TabsContent>

        <TabsContent value="expenses" className="mt-3">
          {hasExpenses ? (
            <ChartContainer config={revenueExpensesChartConfig} className={`${CHART_H} w-full`}>
              <AreaChart
                data={revenueVsExpensesTimeSeries}
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashboardExpensesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-series-expenses)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-series-expenses)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border)"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tick={chartAxisTickStyle}
                />
                <YAxis tickLine={false} axisLine={false} width={52} tick={chartAxisTickStyle} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value) => money(Number(value))} />}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="var(--color-series-expenses)"
                  fill="url(#dashboardExpensesFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <EmptyChart message="No expenses in this period" />
          )}
        </TabsContent>
      </Tabs>
    </SurfaceCard>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className={`${CHART_H} flex items-center justify-center text-sm text-muted-foreground`}>
      {message}
    </div>
  );
}
