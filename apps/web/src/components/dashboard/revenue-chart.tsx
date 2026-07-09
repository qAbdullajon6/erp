import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/format";
import type { RevenueBucket } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueChartProps {
  data: RevenueBucket[];
  totalRevenue: string | null;
  loading: boolean;
}

export function RevenueChart({ data, totalRevenue, loading }: RevenueChartProps) {
  if (loading) {
    return <Skeleton className="h-[22rem] rounded-2xl" />;
  }

  const hasData = data.length > 0 && data.some((d) => d.revenue > 0 || d.expenses > 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl font-bold text-foreground">Revenue vs Expenses</h3>
          <p className="mt-1 text-sm text-muted-foreground">Last 30 days</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold text-foreground">
            {totalRevenue ? formatMoney(totalRevenue) : "—"}
          </div>
          <div className="text-sm font-medium text-muted-foreground">total revenue</div>
        </div>
      </div>

      <div className="mt-8 h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expensesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-warning)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-warning)" stopOpacity={0} />
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
                formatter={(value: number, name: string) => [formatMoney(value), name === "revenue" ? "Revenue" : "Expenses"]}
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="revenue" stroke="var(--color-brand)" fill="url(#revenueFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" stroke="var(--color-warning)" fill="url(#expensesFill)" strokeWidth={2} />
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
