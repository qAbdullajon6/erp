'use client';

import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  ClipboardCheck,
  Fuel,
  Receipt,
  Truck,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { DriverOperationalStatusBadge } from '@/components/shared/driver-operational-status-badge';
import { DeliveryCard } from '@/components/my-deliveries/delivery-card';
import { describeError } from '@/lib/api/describe-error';
import { useMyDeliveriesQuery } from '@/lib/api/my-deliveries';
import {
  useDriverExpensesQuery,
  useDriverWorkspaceProfileQuery,
  useUpdateOperationalStatusMutation,
  type DriverOperationalStatus,
} from '@/lib/api/driver-workspace';
import { buildDriverDailySummary } from '@/lib/driver/driver-daily-summary.builder';
import { buildDriverPerformance } from '@/lib/driver/driver-performance.builder';
import { DriverBreakControls } from './driver-break-controls';
import { DriverExpenseSheet } from './driver-expense-sheet';
import { DriverFuelSheet } from './driver-fuel-sheet';
import { DriverInspectionHistory } from './driver-inspection-history';
import { DriverInspectionSheet } from './driver-inspection-sheet';
import { DriverOfflineBanner } from './driver-offline-banner';
import { useDriverNotifications } from '@/lib/driver/use-driver-notifications';

const IN_PROGRESS = new Set(['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT']);
const OPS_OPTIONS: DriverOperationalStatus[] = [
  'AVAILABLE',
  'BUSY',
  'DRIVING',
  'LOADING',
  'BREAK',
  'OFFLINE',
];

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function DriverWorkspaceDashboard() {
  const navigate = useNavigate();
  const profileQ = useDriverWorkspaceProfileQuery(true);
  const deliveriesQ = useMyDeliveriesQuery(!!profileQ.data, true);
  const expensesQ = useDriverExpensesQuery(!!profileQ.data);
  const updateOps = useUpdateOperationalStatusMutation();
  const notifications = useDriverNotifications(!!profileQ.data);

  const [fuelOpen, setFuelOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);

  const openJob = (id: string) => {
    void navigate({ to: '/app/driver/$dispatchId', params: { dispatchId: id } });
  };

  const deliveries = useMemo(() => deliveriesQ.data ?? [], [deliveriesQ.data]);
  const expenses = useMemo(() => expensesQ.data ?? [], [expensesQ.data]);

  const buckets = useMemo(() => {
    const current: typeof deliveries = [];
    const upcoming: typeof deliveries = [];
    const completedToday: typeof deliveries = [];
    for (const d of deliveries) {
      if (d.status === 'DELIVERED' && d.deliveryDateActual && isToday(d.deliveryDateActual)) {
        completedToday.push(d);
      } else if (d.status === 'CANCELLED' || d.status === 'DELIVERED') {
        // skip older finished
      } else if (IN_PROGRESS.has(d.status) || d.driverAcceptanceStatus === 'PENDING') {
        current.push(d);
      } else if (isToday(d.deliveryDateScheduled) || isToday(d.pickupDateScheduled)) {
        current.push(d);
      } else {
        upcoming.push(d);
      }
    }
    return { current, upcoming, completedToday };
  }, [deliveries]);

  const currentJob = buckets.current[0] ?? null;

  const daily = useMemo(
    () =>
      buildDriverDailySummary({
        trips: deliveries,
        expenses,
        breaks: profileQ.data?.openBreak
          ? [{ startedAt: profileQ.data.openBreak.startedAt, endedAt: null }]
          : [],
        distanceKm: null,
      }),
    [deliveries, expenses, profileQ.data?.openBreak],
  );

  const performance = useMemo(
    () =>
      buildDriverPerformance({
        trips: deliveries.map((d) => ({
          id: d.id,
          status: d.status,
          pickupDateScheduled: d.pickupDateScheduled,
          deliveryDateScheduled: d.deliveryDateScheduled,
          pickupDateActual: d.pickupDateActual,
          deliveryDateActual: d.deliveryDateActual,
          statusHistory: d.statusHistory,
        })),
      }),
    [deliveries],
  );

  if (profileQ.isLoading) return <LoadingState label="Loading workspace…" />;
  if (profileQ.isError || !profileQ.data) {
    return (
      <ErrorState
        message={
          profileQ.error instanceof Error
            ? profileQ.error.message
            : 'No driver profile is linked to your account yet.'
        }
      />
    );
  }

  const profile = profileQ.data;

  const handleOps = async (status: DriverOperationalStatus) => {
    try {
      await updateOps.mutateAsync(status);
      toast.success('Status updated');
    } catch (err) {
      toast.error(describeError(err, 'Failed to update status'));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Hi, {profile.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Driver workspace</p>
      </div>

      <DriverOfflineBanner />

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Active" value={buckets.current.length} />
        <Kpi label="Done today" value={buckets.completedToday.length} />
        <Kpi label="On-time %" value={`${performance.onTimePct}%`} />
        <Kpi label="Trips" value={performance.trips} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Operational status
            </p>
            <div className="mt-2">
              <DriverOperationalStatusBadge
                status={profile.operationalStatus}
                onBreak={profile.onBreak}
              />
            </div>
          </div>
          <Select
            value={profile.operationalStatus}
            onValueChange={(v) => void handleOps(v as DriverOperationalStatus)}
            disabled={updateOps.isPending}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DriverBreakControls profile={profile} />

      {notifications.unreadCount > 0 ? (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            {notifications.unreadCount} new assignment
            {notifications.unreadCount === 1 ? '' : 's'}
          </p>
          <ul className="mt-2 space-y-2">
            {notifications.items
              .filter((n) => !n.isRead)
              .slice(0, 3)
              .map((n) => (
                <li key={n.id} className="text-sm">
                  <p className="font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-brand"
                    onClick={() => {
                      void notifications.markRead.mutateAsync(n.id);
                      if (n.entityId) openJob(n.entityId);
                    }}
                  >
                    Open job
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {currentJob ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Current job
          </h2>
          <DeliveryCard delivery={currentJob} onClick={() => openJob(currentJob.id)} />
        </div>
      ) : !deliveriesQ.isLoading ? (
        <EmptyState
          icon={Truck}
          title="No active job"
          description="New assignments from dispatch will show up here."
          compact
        />
      ) : null}

      {buckets.upcoming.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming
          </h2>
          <div className="space-y-3">
            {buckets.upcoming.slice(0, 5).map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => openJob(d.id)} />
            ))}
          </div>
        </div>
      ) : null}

      {buckets.completedToday.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Completed today
          </h2>
          <div className="space-y-3">
            {buckets.completedToday.map((d) => (
              <DeliveryCard key={d.id} delivery={d} onClick={() => openJob(d.id)} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          Daily summary
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <SummaryRow label="Trips" value={String(daily.trips)} />
          <SummaryRow label="Hours" value={String(daily.hours)} />
          <SummaryRow label="Fuel" value={daily.fuelTotal.toFixed(2)} />
          <SummaryRow label="Expenses" value={daily.expensesTotal.toFixed(2)} />
          <SummaryRow label="Break min" value={String(daily.breakMinutes)} />
          <SummaryRow label="Distance" value={daily.distanceKm == null ? '—' : `${daily.distanceKm} km`} />
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Performance snapshot</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <SummaryRow label="Completed" value={String(performance.completed)} />
          <SummaryRow label="Cancelled" value={String(performance.cancelled)} />
          <SummaryRow label="Late %" value={`${performance.latePct}%`} />
          <SummaryRow
            label="Avg delivery"
            value={
              performance.avgDeliveryMinutes == null
                ? '—'
                : `${performance.avgDeliveryMinutes} min`
            }
          />
        </dl>
      </div>

      <DriverInspectionHistory enabled={!!profileQ.data} />

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setFuelOpen(true)}>
            <Fuel className="h-4 w-4" />
            <span className="text-xs">Fuel</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setExpenseOpen(true)}>
            <Receipt className="h-4 w-4" />
            <span className="text-xs">Expense</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 py-3"
            onClick={() => {
              if (!currentJob?.vehicle.id) {
                toast.error('Open a job with a vehicle to inspect');
                return;
              }
              setInspectionOpen(true);
            }}
          >
            <ClipboardCheck className="h-4 w-4" />
            <span className="text-xs">Inspect</span>
          </Button>
        </div>
      </div>

      <DriverFuelSheet
        open={fuelOpen}
        onOpenChange={setFuelOpen}
        dispatchId={currentJob?.id}
        vehicleId={currentJob?.vehicle.id}
      />
      <DriverExpenseSheet
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        dispatchId={currentJob?.id}
        vehicleId={currentJob?.vehicle.id}
      />
      {currentJob?.vehicle.id ? (
        <DriverInspectionSheet
          open={inspectionOpen}
          onOpenChange={setInspectionOpen}
          vehicleId={currentJob.vehicle.id}
          dispatchId={currentJob.id}
        />
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
