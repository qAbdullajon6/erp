import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AiOpsSuggestions } from "@/components/dashboard/ai-ops-suggestions";
import { AttentionCenter } from "@/components/dashboard/attention-center";
import { ExceptionHero, SecondaryPulse } from "@/components/dashboard/exception-hero";
import { FinancialWarnings } from "@/components/dashboard/financial-warnings";
import { FleetReady } from "@/components/dashboard/fleet-ready";
import { DelayedDeliveries } from "@/components/dashboard/delayed-deliveries";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { LiveDispatch } from "@/components/dashboard/live-dispatch";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { UnassignedQueue } from "@/components/dashboard/unassigned-queue";
import { useCurrentUser } from "@/lib/api/auth";
import { useDashboardSummary } from "@/lib/api/dashboard";
import { useFinanceSummaryQuery } from "@/lib/api/finance";
import { useLiveFleetQuery } from "@/lib/api/telematics";
import { useDispatchBoardSummary } from "@/lib/hooks/use-dispatches";
import { LoadingState, ErrorState } from "@/components/shared/list-states";
import { PageHeader } from "@/components/shared/page-header";
import { ADMIN_OPS_ROLES, DISPATCH_WRITE_ROLES, DISPATCH_ROLES, FLEET_ROLES } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/api/organizations";
import { formatRelativeTime } from "@/lib/format";

const LIVE_REFRESH_MS = 30_000;

function shiftLabel(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "Night";
  if (h < 14) return "Morning";
  if (h < 22) return "Afternoon";
  return "Night";
}

function OpsClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(now);
  const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(now);

  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span className="font-medium tabular-nums text-foreground">{time}</span>
      <span className="text-border" aria-hidden>·</span>
      <span>
        {day} · {weekday}
      </span>
      <span className="text-border" aria-hidden>·</span>
      <span>Shift: {shiftLabel(now)}</span>
    </span>
  );
}


export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview — FlowERP AI" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: currentUser, loading: userLoading, error: userError, refetch: refetchUser } =
    useCurrentUser();
  const role = currentUser?.membership.role;

  if (userLoading) return <LoadingState label="Loading dashboard..." />;
  if (userError || !currentUser) {
    return <ErrorState message={userError || "Failed to load account."} onRetry={() => refetchUser()} />;
  }
  if (role === "DRIVER") {
    return <Navigate to="/app/driver" />;
  }

  return (
    <OperationsCommandCenter
      includeFleet={DISPATCH_ROLES.includes(role as MembershipRole)}
      includeTelematics={FLEET_ROLES.includes(role as MembershipRole)}
      role={role as MembershipRole}
    />
  );
}

function OperationsCommandCenter({
  includeFleet,
  includeTelematics,
  role,
}: {
  includeFleet: boolean;
  includeTelematics: boolean;
  role: MembershipRole;
}) {
  const canCreateDispatch = DISPATCH_WRITE_ROLES.includes(role);

  const summary = useDashboardSummary({ refetchInterval: LIVE_REFRESH_MS });
  const board = useDispatchBoardSummary({
    enabled: includeFleet,
    refetchInterval: includeFleet ? LIVE_REFRESH_MS : undefined,
  });
  const finance = useFinanceSummaryQuery();
  const liveFleet = useLiveFleetQuery({
    enabled: includeTelematics,
    refetchInterval: includeTelematics ? LIVE_REFRESH_MS : undefined,
  });

  const totals = summary.data?.totals;
  const today = summary.data?.today;
  const boardData = includeFleet ? board.data : null;
  const unassigned = boardData ? boardData.unassignedOrders.length : null;

  const liveByVehicleId = useMemo(() => {
    if (!includeTelematics || !liveFleet.data) return undefined;
    return new Map(liveFleet.data.map((v) => [v.vehicleId, v]));
  }, [includeTelematics, liveFleet.data]);

  const unassignedIds = useMemo(
    () => new Set(boardData?.unassignedOrders.map((o) => o.id) ?? []),
    [boardData],
  );

  const worstDelayDays = useMemo(() => {
    const items = summary.data?.delayedOrders.items ?? [];
    if (items.length === 0) return null;
    return Math.max(
      ...items.map((o) =>
        Math.max(1, Math.floor((Date.now() - new Date(o.deliveryDate).getTime()) / 86_400_000)),
      ),
    );
  }, [summary.data?.delayedOrders.items]);

  const oldestUnassignedWait = useMemo(() => {
    const orders = boardData?.unassignedOrders ?? [];
    if (orders.length === 0) return null;
    let oldest = Infinity;
    let iso: string | null = null;
    for (const o of orders) {
      const t = new Date(o.createdAt ?? o.pickupDate).getTime();
      if (t < oldest) {
        oldest = t;
        iso = o.createdAt ?? o.pickupDate;
      }
    }
    return iso ? formatRelativeTime(iso) : null;
  }, [boardData?.unassignedOrders]);

  const errors = [summary.error, includeFleet ? board.error : null].filter(
    (e): e is string => Boolean(e),
  );
  const error =
    errors.length > 0
      ? errors.length > 1
        ? `${errors[0]} (+${errors.length - 1} more)`
        : errors[0]
      : null;

  const retryAll = () => {
    summary.refetch();
    if (includeFleet) board.refetch();
    void finance.refetch();
    if (includeTelematics) void liveFleet.refetch();
  };

  const loading = summary.loading || (includeFleet && board.loading && !board.data);

  return (
    <div className="space-y-5" data-testid="dashboard">

      {/* ── 1. Header ── */}
      <div className="border-b border-border/60 pb-4">
        <PageHeader title="Today" subtitle={<OpsClock />} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={retryAll} className="text-xs font-medium underline">
            Retry
          </button>
        </div>
      )}

      {/* ── 2. Setup checklist (conditional — hidden on seeded demo) ── */}
      <SetupChecklist canDismiss={ADMIN_OPS_ROLES.includes(role)} />

      {/* ── 3. Compact KPI strip ── */}
      <KpiCards data={summary.data} loading={summary.loading} />

      {/* ── 4. Exception / attention strip ── */}
      <div className="space-y-2">
        <ExceptionHero
          delayed={totals?.delayedOrders ?? 0}
          worstDelayDays={worstDelayDays}
          unassigned={unassigned}
          oldestUnassignedWait={oldestUnassignedWait}
          readyDrivers={boardData ? boardData.drivers.available.length : null}
          readyVehicles={boardData ? boardData.vehicles.available.length : null}
          includeFleet={includeFleet}
          loading={loading}
        />
        {!loading && today && (
          <SecondaryPulse
            dueToday={today.dueToday}
            deliveredToday={today.deliveredToday}
            pickups={today.pickupsDueToday}
            freeDrivers={boardData ? boardData.drivers.available.length : null}
            freeVehicles={boardData ? boardData.vehicles.available.length : null}
            includeFleet={includeFleet}
          />
        )}
      </div>

      {/* ── 5. Operations command center ── */}
      {includeFleet ? (
        <section
          className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-12 min-[960px]:items-start"
          aria-label="Operations"
        >
          {/* Left — workload: dispatch queue + delayed */}
          <div className="flex flex-col gap-4 min-[960px]:col-span-7">
            <UnassignedQueue
              orders={boardData?.unassignedOrders ?? []}
              loading={board.loading}
              canDispatch={canCreateDispatch}
            />
            <DelayedDeliveries
              orders={summary.data?.delayedOrders.items ?? []}
              total={summary.data?.delayedOrders.total ?? 0}
              loading={summary.loading}
              unassignedIds={unassignedIds}
              canDispatch={canCreateDispatch}
            />
            <FleetReady
              board={boardData}
              loading={board.loading}
              canDispatch={canCreateDispatch}
            />
          </div>

          {/* Right — intelligence: AI + live fleet + finance */}
          <div className="flex flex-col gap-4 min-[960px]:col-span-5">
            <AiOpsSuggestions
              board={boardData ?? null}
              canDispatch={canCreateDispatch}
              loading={board.loading}
            />
            <LiveDispatch
              board={boardData}
              loading={board.loading}
              liveByVehicleId={liveByVehicleId}
            />
            <FinancialWarnings finance={finance.data} loading={finance.isPending} />
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-12 min-[960px]:items-start">
          <div className="min-[960px]:col-span-7">
            <DelayedDeliveries
              orders={summary.data?.delayedOrders.items ?? []}
              total={summary.data?.delayedOrders.total ?? 0}
              loading={summary.loading}
              canDispatch={canCreateDispatch}
            />
          </div>
          <div className="min-[960px]:col-span-5">
            <FinancialWarnings finance={finance.data} loading={finance.isPending} />
          </div>
        </section>
      )}

      {/* ── 6. Performance + attention + activity (bottom) ── */}
      <section
        className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-[minmax(0,1fr)_420px] min-[960px]:items-start"
        aria-label="Performance and activity"
      >
        <DashboardCharts data={summary.data} loading={summary.loading} />

        <div className="flex flex-col gap-4">
          <AttentionCenter attention={summary.data?.attention} loading={summary.loading} />
          <RecentActivity items={summary.data?.recentActivity} loading={summary.loading} />
        </div>
      </section>

    </div>
  );
}
