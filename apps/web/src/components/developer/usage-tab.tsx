import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useUsageStatsQuery } from '@/lib/api/developer';

export function UsageTab() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading, isError, refetch } = useUsageStatsQuery(startDate, endDate);

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-4">
        <div>
          <label className="text-sm font-medium">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">End Date</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
        </div>
        <Button size="sm" onClick={() => refetch()}>Refresh</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : isError ? (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load usage stats
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">Retry</Button>
        </div>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{data.totalCalls}</p>
            <p className="text-sm text-muted-foreground">Total API Calls</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{data.successRate}%</p>
            <p className="text-sm text-muted-foreground">
              Success Rate · {data.failureCount} failed
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{data.avgLatencyMs}ms</p>
            <p className="text-sm text-muted-foreground">Avg Latency</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-2xl font-bold">{Object.keys(data.endpointBreakdown).length}</p>
            <p className="text-sm text-muted-foreground">Unique Endpoints</p>
          </div>

          <div className="rounded-lg border p-4 sm:col-span-2">
            <h3 className="mb-2 text-sm font-medium">Webhook Deliveries</h3>
            {data.webhookDeliveries.total === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries in this period</p>
            ) : (
              <div className="flex items-baseline gap-4">
                <div>
                  <p className="text-2xl font-bold">{data.webhookDeliveries.successRate}%</p>
                  <p className="text-xs text-muted-foreground">delivered</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.webhookDeliveries.delivered} delivered · {data.webhookDeliveries.failed} failed
                  {' · '}{data.webhookDeliveries.total} total
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-4 sm:col-span-2">
            <h3 className="mb-2 text-sm font-medium">Last Activity</h3>
            <p className="text-sm text-muted-foreground">
              {data.lastActivityAt
                ? new Date(data.lastActivityAt).toLocaleString()
                : 'No API calls recorded in this period'}
            </p>
          </div>

          {data.dailyUsage.length > 0 && (
            <div className="rounded-lg border p-4 sm:col-span-4">
              <h3 className="mb-3 text-sm font-medium">Daily Usage</h3>
              {/* A plain proportional bar row rather than a chart dependency —
                  this reads the same and adds nothing to the bundle. */}
              <div className="flex items-end gap-1" style={{ height: 96 }}>
                {data.dailyUsage.map(({ date, count }) => {
                  const max = Math.max(...data.dailyUsage.map((d) => d.count));
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <div
                      key={date}
                      className="flex-1 rounded-t bg-primary/70 transition-all hover:bg-primary"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                      title={`${date}: ${count} call${count !== 1 ? 's' : ''}`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{data.dailyUsage[0]?.date}</span>
                <span>{data.dailyUsage[data.dailyUsage.length - 1]?.date}</span>
              </div>
            </div>
          )}

          <div className="rounded-lg border p-4 sm:col-span-4">
            <h3 className="mb-2 text-sm font-medium">Status Breakdown</h3>
            <div className="space-y-2">
              {Object.entries(data.statusBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([code, count]) => {
                  const pct = data.totalCalls > 0 ? ((count / data.totalCalls) * 100).toFixed(1) : '0';
                  return (
                    <div key={code} className="flex items-center gap-3">
                      <span className="w-12 text-sm font-mono">{code}</span>
                      <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-sm text-muted-foreground">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="rounded-lg border p-4 sm:col-span-4">
            <h3 className="mb-2 text-sm font-medium">Endpoint Breakdown</h3>
            <div className="space-y-2">
              {Object.entries(data.endpointBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([endpoint, count]) => {
                  const pct = data.totalCalls > 0 ? ((count / data.totalCalls) * 100).toFixed(1) : '0';
                  return (
                    <div key={endpoint} className="flex items-center gap-3">
                      <span className="flex-1 text-sm font-mono truncate">{endpoint}</span>
                      <div className="h-3 w-48 rounded-full bg-muted overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm text-muted-foreground shrink-0">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
