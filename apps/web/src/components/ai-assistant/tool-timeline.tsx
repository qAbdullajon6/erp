'use client';

import { Ban, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/// Present/past tense copy per tool, keyed by the exact tool name the
/// backend registers (see apps/api/src/ai/tools/*.ts). Unlisted tools fall
/// back to a humanized version of their name — new tools show up sensibly
/// without needing an entry here, they just read a little more plainly.
const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  search_customers: { running: 'Searching customers…', done: 'Searched customers' },
  search_orders: { running: 'Searching orders…', done: 'Searched orders' },
  search_drivers: { running: 'Searching drivers…', done: 'Searched drivers' },
  search_vehicles: { running: 'Searching vehicles…', done: 'Searched vehicles' },
  search_dispatches: { running: 'Searching dispatches…', done: 'Searched dispatches' },
  search_invoices: { running: 'Searching invoices…', done: 'Searched invoices' },
  list_notifications: { running: 'Checking notifications…', done: 'Checked notifications' },
  list_recent_notifications: { running: 'Checking notifications…', done: 'Checked notifications' },
  get_unread_notification_count: { running: 'Counting unread notifications…', done: 'Counted unread notifications' },
  mark_notification_read: { running: 'Marking notification as read…', done: 'Marked notification as read' },
  create_notification: { running: 'Sending notification…', done: 'Sent notification' },
  import_status: { running: 'Checking import status…', done: 'Checked import status' },
  finance_summary: { running: 'Calculating financial summary…', done: 'Calculated financial summary' },
  generate_report: { running: 'Generating report…', done: 'Generated report' },
  dashboard_summary: { running: 'Gathering dashboard data…', done: 'Gathered dashboard data' },
  fleet_utilization: { running: 'Calculating fleet utilization…', done: 'Calculated fleet utilization' },
  developer_api_usage: { running: 'Checking API usage…', done: 'Checked API usage' },
  subscription_summary: { running: 'Checking subscription…', done: 'Checked subscription' },
  current_limits: { running: 'Checking plan limits…', done: 'Checked plan limits' },
  remaining_quota: { running: 'Checking remaining quota…', done: 'Checked remaining quota' },
  upgrade_recommendation: { running: 'Evaluating upgrade options…', done: 'Evaluated upgrade options' },
  seat_summary: { running: 'Checking seat usage…', done: 'Checked seat usage' },
  fleet_status: { running: 'Checking fleet status…', done: 'Checked fleet status' },
  track_vehicle: { running: 'Locating vehicle…', done: 'Located vehicle' },
  list_fleet_alerts: { running: 'Checking fleet alerts…', done: 'Checked fleet alerts' },
  driver_safety: { running: 'Reviewing driver safety…', done: 'Reviewed driver safety' },
  create_customer: { running: 'Creating customer…', done: 'Created customer' },
  create_order: { running: 'Creating order…', done: 'Created order' },
  assign_driver: { running: 'Assigning driver…', done: 'Assigned driver' },
  create_workflow: { running: 'Creating workflow…', done: 'Created workflow' },
};

function humanize(name: string): string {
  return name.replace(/_/g, ' ');
}

export function toolLabel(name: string, phase: 'running' | 'done'): string {
  const known = TOOL_LABELS[name];
  if (known) return known[phase];
  return phase === 'running' ? `Running ${humanize(name)}…` : `Ran ${humanize(name)}`;
}

export interface ToolTimelineStep {
  key: string;
  name: string;
  phase: 'running' | 'done' | 'failed' | 'denied';
  durationMs?: number | null;
  error?: string | null;
}

/// A readable, step-by-step account of what the assistant actually did —
/// "Searching invoices… → Searched invoices" — instead of a cluster of raw
/// tool-name badges. Used for both a turn still in flight and a persisted
/// message's tool calls, so the two look the same once the live one settles.
export function ToolTimeline({ steps }: { steps: ToolTimelineStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {steps.map((step) => (
        <div key={step.key} className="flex items-center gap-2 text-xs" title={step.error ?? undefined}>
          <StepIcon phase={step.phase} />
          <span
            className={cn(
              step.phase === 'running' ? 'text-foreground' : 'text-muted-foreground',
              step.phase === 'failed' && 'text-destructive',
            )}
          >
            {step.phase === 'running'
              ? toolLabel(step.name, 'running')
              : step.phase === 'failed'
                ? `Couldn't ${humanize(step.name)}`
                : step.phase === 'denied'
                  ? `Skipped ${humanize(step.name)} (not approved)`
                  : toolLabel(step.name, 'done')}
          </span>
          {step.phase !== 'running' && typeof step.durationMs === 'number' && step.durationMs > 0 && (
            <span className="text-muted-foreground">· {step.durationMs}ms</span>
          )}
        </div>
      ))}
    </div>
  );
}

function StepIcon({ phase }: { phase: ToolTimelineStep['phase'] }) {
  if (phase === 'running') return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand" />;
  if (phase === 'failed') return <XCircle className="h-3 w-3 shrink-0 text-destructive" />;
  if (phase === 'denied') return <Ban className="h-3 w-3 shrink-0 text-warning" />;
  return <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />;
}
