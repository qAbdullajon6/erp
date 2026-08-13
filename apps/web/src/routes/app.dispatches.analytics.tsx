import { createFileRoute } from '@tanstack/react-router';
import { DispatchAnalyticsDashboard } from '@/components/dispatch/analytics/dispatch-analytics-dashboard';
import { ProtectedApiRoute } from '@/components/layout/protected-api-route';
import { DISPATCH_ROLES } from '@/lib/role-access';
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from '@/components/reports/report-date-range';

const VALID_PRESETS = new Set(Object.keys(DATE_RANGE_PRESET_LABELS));

function parsePreset(value: unknown): DateRangePreset | undefined {
  return typeof value === 'string' && VALID_PRESETS.has(value) ? (value as DateRangePreset) : undefined;
}

function parseDateParam(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/// Mirrors the calendar route's search-param pattern: the selected preset
/// (and custom bounds) live in the URL so refresh, back/forward, and sharing
/// a link all keep the range the admin picked, instead of silently resetting
/// to the hardcoded default every time the page reloads.
export type DispatchAnalyticsSearch = {
  preset?: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
};

export const Route = createFileRoute('/app/dispatches/analytics')({
  head: () => ({
    meta: [{ title: "Dispatch Analytics — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): DispatchAnalyticsSearch => {
    const out: DispatchAnalyticsSearch = {};
    const preset = parsePreset(search.preset);
    const dateFrom = parseDateParam(search.dateFrom);
    const dateTo = parseDateParam(search.dateTo);
    if (preset) out.preset = preset;
    if (dateFrom) out.dateFrom = dateFrom;
    if (dateTo) out.dateTo = dateTo;
    return out;
  },
  component: DispatchAnalyticsPage,
});

function DispatchAnalyticsPage() {
  return (
    <ProtectedApiRoute requireRoles={DISPATCH_ROLES}>
      <DispatchAnalyticsDashboard />
    </ProtectedApiRoute>
  );
}
