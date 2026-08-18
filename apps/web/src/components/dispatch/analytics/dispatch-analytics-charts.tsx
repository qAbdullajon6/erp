'use client';

import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { SurfaceCard, SurfaceCardHeader } from '@/components/ui/surface-card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { chartAxisTickStyle, dispatchAnalyticsChartConfig } from '@/lib/chart-theme';
import type { DispatchAnalyticsResponse } from '@/lib/api/dispatch-analytics';
import { cn } from '@/lib/utils';

interface DispatchAnalyticsChartsProps {
  snapshot: DispatchAnalyticsResponse | null;
  loading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'var(--color-muted-foreground)',
  ASSIGNED: 'var(--color-brand)',
  EN_ROUTE_TO_PICKUP: 'var(--color-chart-3)',
  AT_PICKUP: 'var(--color-chart-4)',
  IN_TRANSIT: 'var(--color-chart-5)',
  DELIVERED: 'var(--color-success)',
  CANCELLED: 'var(--color-destructive)',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ASSIGNED: 'Assigned',
  EN_ROUTE_TO_PICKUP: 'En route',
  AT_PICKUP: 'At pickup',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function formatBucketLabel(key: string, granularity: 'day' | 'month'): string {
  try {
    return granularity === 'day' ? format(parseISO(key), 'MMM d') : format(parseISO(`${key}-01`), 'MMM yyyy');
  } catch {
    return key;
  }
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ChartPanel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SurfaceCard className={cn('p-4 sm:p-5', className)}>
      <SurfaceCardHeader className="mb-3 px-0 py-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </SurfaceCardHeader>
      {children}
    </SurfaceCard>
  );
}

export function DispatchAnalyticsCharts({ snapshot, loading }: DispatchAnalyticsChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[300px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!snapshot) return null;

  const byDay = snapshot.dispatchesByDay.points.map((p) => ({
    ...p,
    label: formatBucketLabel(p.label, snapshot.dispatchesByDay.granularity),
  }));
  const byStatus = snapshot.dispatchesByStatus.map((p) => ({
    ...p,
    name: STATUS_LABELS[p.status] ?? p.status,
    fill: STATUS_COLORS[p.status] ?? 'var(--color-brand)',
  }));

  const hasByDay = byDay.some((p) => p.value > 0);
  const hasStatus = byStatus.some((p) => p.count > 0);
  const hasDriver = snapshot.driverWorkload.length > 0;
  const hasVehicle = snapshot.vehicleUtilization.length > 0;
  const hasDelays = snapshot.delayReasons.length > 0;

  const pieConfig: ChartConfig = byStatus.reduce(
    (acc, row) => {
      acc[row.status] = { label: row.name, color: row.fill };
      return acc;
    },
    { ...dispatchAnalyticsChartConfig } as ChartConfig,
  );

  const byDaySubtitle =
    snapshot.dispatchesByDay.granularity === 'day' ? 'Scheduled pickups, by day' : 'Scheduled pickups, by month';

  return (
    <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2" data-testid="dispatch-analytics-charts">
      <ChartPanel title="Dispatch Volume Over Time" subtitle={byDaySubtitle}>
        {hasByDay ? (
          <ChartContainer config={dispatchAnalyticsChartConfig} className="h-[220px] w-full">
            <BarChart data={byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.35} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={chartAxisTickStyle} />
              <YAxis tickLine={false} axisLine={false} width={32} tick={chartAxisTickStyle} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-brand)" radius={[4, 4, 0, 0]} name="Dispatches" />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart message="No scheduled dispatches in this range" />
        )}
      </ChartPanel>

      <ChartPanel title="Dispatches by Status" subtitle="Created in the selected range">
        {hasStatus ? (
          <ChartContainer config={pieConfig} className="mx-auto h-[220px] w-full max-w-[320px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
              <Pie
                data={byStatus}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                stroke="var(--color-surface)"
                strokeWidth={2}
              >
                {byStatus.map((entry) => (
                  <Cell key={entry.status} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : (
          <EmptyChart message="No dispatches created in this range" />
        )}
      </ChartPanel>

      <ChartPanel title="Driver Workload" subtitle="Dispatches per driver in this range">
        {hasDriver ? (
          <ChartContainer config={dispatchAnalyticsChartConfig} className="h-[220px] w-full">
            <BarChart
              data={snapshot.driverWorkload}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.35} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={chartAxisTickStyle} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={88}
                tick={chartAxisTickStyle}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-series-revenue)" radius={[0, 4, 4, 0]} name="Dispatches" />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart message="No dispatches in this range" />
        )}
      </ChartPanel>

      <ChartPanel title="Vehicle Utilization" subtitle="Dispatches per vehicle in this range">
        {hasVehicle ? (
          <ChartContainer config={dispatchAnalyticsChartConfig} className="h-[220px] w-full">
            <BarChart
              data={snapshot.vehicleUtilization}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.35} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={chartAxisTickStyle} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={72}
                tick={chartAxisTickStyle}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-chart-4)" radius={[0, 4, 4, 0]} name="Dispatches" />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart message="No dispatches in this range" />
        )}
      </ChartPanel>

      <ChartPanel title="Delay Reasons" subtitle="Currently delayed dispatches (live, not range-bound)">
        {hasDelays ? (
          <ChartContainer config={dispatchAnalyticsChartConfig} className="h-[220px] w-full">
            <BarChart data={snapshot.delayReasons} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.35} />
              <XAxis dataKey="reason" tickLine={false} axisLine={false} tick={chartAxisTickStyle} />
              <YAxis tickLine={false} axisLine={false} width={32} tick={chartAxisTickStyle} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-warning)" radius={[4, 4, 0, 0]} name="Count" />
            </BarChart>
          </ChartContainer>
        ) : (
          <EmptyChart message="No delayed dispatches" />
        )}
      </ChartPanel>
    </div>
  );
}
