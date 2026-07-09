import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/format";
import type { RevenueBucket } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueChartProps {
  data: RevenueBucket[];
  totalRevenue: string | null;
  loading: boolean;
}

/// Two series means a legend is mandatory — identity must never rest on colour
/// alone. The hues are the validated categorical pair (see --series-* in
/// styles.css), not the reserved success/warning status colours.
const SERIES = [
  { key: "revenue", label: "Revenue", color: "var(--color-series-revenue)", fill: "url(#revenueFill)" },
  { key: "expenses", label: "Expenses", color: "var(--color-series-expenses)", fill: "url(#expensesFill)" },
] as const;

export function RevenueChart({ data, totalRevenue, loading }: RevenueChartProps) {
  if (loading) {
    return <Skeleton className="h-[22rem] rounded-2xl" />;
  }

  const hasData = data.length > 0 && data.some((d) => d.revenue > 0 || d.expenses > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Revenue vs expenses</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Last 30 days</p>
        </div>
        <div className="text-right">
          {/* Sans, not the display face — this is a figure, not a headline. */}
          <div className="text-2xl font-semibold leading-none text-foreground">
            {totalRevenue ? formatMoney(totalRevenue) : "—"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Total revenue</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-5">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-4 h-64 flex-1">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-series-revenue)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-series-revenue)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expensesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-series-expenses)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-series-expenses)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.4} />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatMoney(value),
                  SERIES.find((s) => s.key === name)?.label ?? name,
                ]}
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} fill={s.fill} strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-background/40 text-muted-foreground">
            <div className="text-center">
              <div className="text-sm">No revenue recorded yet</div>
              <div className="mt-2 text-xs text-muted-foreground/70">Delivered orders will appear here</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
