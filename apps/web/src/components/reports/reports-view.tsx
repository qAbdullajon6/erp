import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/api/auth';
import type { ReportFilterParams } from '@/lib/api/reports';
import { DateRangeFilter } from './date-range-filter';
import { resolvePreset, type DateRangePreset, type DateRangeValue } from './report-date-range';
import { ExecutiveOverviewTab } from './executive-overview-tab';
import { OperationsTab } from './operations-tab';
import { FinancialTab } from './financial-tab';

const NO_ACCESS_ROLES = new Set(['DRIVER']);

export function ReportsView() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('last_30_days'));

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handlePresetChange = (preset: DateRangePreset) => {
    setRange(resolvePreset(preset, preset === 'custom' ? { dateFrom: range.dateFrom, dateTo: range.dateTo } : undefined));
  };

  const handleCustomChange = (dateFrom: string, dateTo: string) => {
    setRange({ preset: 'custom', dateFrom, dateTo });
  };

  if (loading) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  if (error || !currentUser) {
    return (
      <div className="rounded-lg bg-destructive/10 p-6 text-sm text-destructive">
        {error || 'Failed to load your account'}
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  if (NO_ACCESS_ROLES.has(currentUser.membership.role)) {
    return (
      <div className="rounded-lg border border-brand/10 bg-surface p-8 text-center text-sm text-muted-foreground">
        Reports aren't available for your role.
      </div>
    );
  }

  const params: ReportFilterParams = { dateFrom: range.dateFrom, dateTo: range.dateTo, comparisonPeriod: 'previous_period' };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Reports</h1>
        <p className="mt-2 text-muted-foreground">Executive, operational, and financial performance</p>
      </div>

      <DateRangeFilter value={range} onPresetChange={handlePresetChange} onCustomChange={handleCustomChange} />

      <Tabs defaultValue="executive">
        <TabsList>
          <TabsTrigger value="executive">Executive Overview</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>
        <TabsContent value="executive" className="pt-4">
          <ExecutiveOverviewTab params={params} />
        </TabsContent>
        <TabsContent value="operations" className="pt-4">
          <OperationsTab params={params} />
        </TabsContent>
        <TabsContent value="financial" className="pt-4">
          <FinancialTab params={params} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
