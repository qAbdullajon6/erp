import { useNavigate, useSearch } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/api/auth';
import type { MembershipRole } from '@/lib/api/organizations';
import type { ComparisonPeriod, ReportFilterParams } from '@/lib/api/reports';
import { FLEET_ROLES, INVOICE_FINALIZE_ROLES } from '@/lib/role-access';
import type { ReportTab } from '@/routes/app.reports';
import { DateRangeFilter } from './date-range-filter';
import { resolvePreset, type DateRangePreset, type DateRangeValue } from './report-date-range';
import { ExecutiveOverviewTab } from './executive-overview-tab';
import { OperationsTab } from './operations-tab';
import { FinancialTab } from './financial-tab';
import { FleetTelematicsTab } from './fleet-telematics-tab';

const NO_ACCESS_ROLES = new Set(['DRIVER']);

const COMPARISON_OPTIONS: { value: ComparisonPeriod; label: string }[] = [
  { value: 'previous_period', label: 'vs prior period' },
  { value: 'previous_year', label: 'vs prior year' },
  { value: 'none', label: 'No comparison' },
];

export function ReportsView() {
  const { data: currentUser, loading, error, refetch } = useCurrentUser();
  const navigate = useNavigate({ from: '/app/reports' });
  const search = useSearch({ from: '/app/reports' });

  const tab: ReportTab = search.tab ?? 'executive';
  const comparisonPeriod: ComparisonPeriod = search.comparisonPeriod ?? 'previous_period';
  const range: DateRangeValue =
    search.preset === 'custom' && search.dateFrom && search.dateTo
      ? { preset: 'custom', dateFrom: search.dateFrom, dateTo: search.dateTo }
      : resolvePreset(search.preset ?? 'last_30_days');

  const setTab = (next: string) => {
    void navigate({
      to: '/app/reports',
      search: (prev) => ({ ...prev, tab: next === 'executive' ? undefined : (next as ReportTab) }),
    });
  };

  const handlePresetChange = (preset: DateRangePreset) => {
    const next = resolvePreset(preset, preset === 'custom' ? { dateFrom: range.dateFrom, dateTo: range.dateTo } : undefined);
    void navigate({
      to: '/app/reports',
      search: (prev) => ({
        ...prev,
        preset: preset === 'last_30_days' ? undefined : preset,
        dateFrom: preset === 'custom' ? next.dateFrom : undefined,
        dateTo: preset === 'custom' ? next.dateTo : undefined,
      }),
    });
  };

  const handleCustomChange = (dateFrom: string, dateTo: string) => {
    void navigate({
      to: '/app/reports',
      search: (prev) => ({ ...prev, preset: 'custom', dateFrom, dateTo }),
    });
  };

  const setComparisonPeriod = (next: ComparisonPeriod) => {
    void navigate({
      to: '/app/reports',
      search: (prev) => ({ ...prev, comparisonPeriod: next === 'previous_period' ? undefined : next }),
    });
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

  const role = currentUser.membership.role as MembershipRole;
  const canViewFinancial = INVOICE_FINALIZE_ROLES.includes(role);
  const canViewFleet = FLEET_ROLES.includes(role);
  const params: ReportFilterParams = {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    comparisonPeriod,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Reports</h1>
        <p className="mt-2 text-muted-foreground">Executive, operational, financial, and fleet performance</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <DateRangeFilter value={range} onPresetChange={handlePresetChange} onCustomChange={handleCustomChange} />
        </div>
        <div>
          <label htmlFor="report-comparison" className="mb-1 block text-xs font-medium text-muted-foreground">
            Compare
          </label>
          <select
            id="report-comparison"
            value={comparisonPeriod}
            onChange={(e) => setComparisonPeriod(e.target.value as ComparisonPeriod)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {COMPARISON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Tabs
        value={
          (tab === 'financial' && !canViewFinancial) || (tab === 'fleet' && !canViewFleet) ? 'executive' : tab
        }
        onValueChange={setTab}
      >
        <TabsList>
          <TabsTrigger value="executive">Executive Overview</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          {canViewFinancial && <TabsTrigger value="financial">Financial</TabsTrigger>}
          {canViewFleet && <TabsTrigger value="fleet">Fleet Telematics</TabsTrigger>}
        </TabsList>
        <TabsContent value="executive" className="pt-4">
          <ExecutiveOverviewTab params={params} />
        </TabsContent>
        <TabsContent value="operations" className="pt-4">
          <OperationsTab params={params} />
        </TabsContent>
        {canViewFinancial && (
          <TabsContent value="financial" className="pt-4">
            <FinancialTab params={params} />
          </TabsContent>
        )}
        {canViewFleet && (
          <TabsContent value="fleet" className="pt-4">
            <FleetTelematicsTab dateFrom={range.dateFrom} dateTo={range.dateTo} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
