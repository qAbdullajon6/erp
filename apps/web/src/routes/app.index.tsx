import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
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
import { ADMIN_OPS_ROLES, ORDER_WRITE_ROLES, DISPATCH_WRITE_ROLES, DISPATCH_ROLES, FLEET_ROLES } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/api/organizations";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Plus, RefreshCw, Sparkles } from "lucide-react";

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
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Today</h1>
        <span className="text-lg font-semibold tabular-nums text-foreground">{time}</span>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
        <span>
          {day} · {weekday}
        </span>
        <span className="text-border" aria-hidden>
          ·
        </span>
        <span>Shift: {shiftLabel(now)}</span>
        <span className="text-border" aria-hidden>
          ·
        </span>
        <span className="font-medium text-foreground">Operations Center</span>
      </p>
    </div>
  );
}

function FreshnessControl({
  updatedAt,
  isFetching,
  onRefresh,
}: {
  updatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const secs = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0;
  const label = isFetching ? "Updating" : secs < 15 ? "Live" : secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching}
      title="Refresh now"
      aria-label={`Dashboard data freshness: ${label}. Refresh now.`}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-surface/50 px-2.5 text-[11px] font-medium text-muted-foreground hover:border-brand hover:text-brand disabled:opacity-70"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", isFetching ? "animate-pulse bg-warning" : "bg-success")} aria-hidden />
      <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} aria-hidden />
      <span className="tabular-nums" aria-live="polite">
        {label}
      </span>
    </button>
  );
}

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview — FlowERP AI" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: currentUser, loading: userLoading, error: userError, refetch: refetchUser } = useCurrentUser();
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
  const canCreateOrder = ORDER_WRITE_ROLES.includes(role);
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
      ...items.map((o) => Math.max(1, Math.floor((Date.now() - new Date(o.deliveryDate).getTime()) / 86_400_000))),
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

  const errors = [summary.error, includeFleet ? board.error : null].filter((e): e is string => Boolean(e));
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

  const updatedAt = Math.max(
    summary.dataUpdatedAt ?? 0,
    includeFleet ? board.dataUpdatedAt ?? 0 : 0,
    includeTelematics ? liveFleet.dataUpdatedAt ?? 0 : 0,
  );
  const isRefreshing =
    summary.isFetching || (includeFleet && board.isFetching) || (includeTelematics && liveFleet.isFetching);
  const loading = summary.loading || (includeFleet && board.loading && !board.data);

  return (
    // Tests need to say "the dashboard rendered" without depending on whatever
    // the headline copy happens to be this month.
    <div className="space-y-8" data-testid="dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <OpsClock />
        <div className="flex flex-wrap items-center gap-1.5">
          <FreshnessControl updatedAt={updatedAt} isFetching={isRefreshing} onRefresh={retryAll} />
          <Link
            to="/app/ai-assistant"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/80 px-2.5 text-[11px] font-medium text-muted-foreground hover:border-brand hover:text-brand"
          >
            <Sparkles className="h-3 w-3" />
            Ask AI
          </Link>
          {canCreateOrder && (
            <Link
              to="/app/orders"
              search={{ create: true }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/80 px-2.5 text-[11px] font-medium text-muted-foreground hover:border-brand hover:text-brand"
            >
              <Plus className="h-3 w-3" />
              Order
            </Link>
          )}
          {canCreateDispatch && (
            <Link
              to="/app/dispatches/create"
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-3 text-[11px] font-semibold text-brand-foreground hover:opacity-90"
            >
              <Plus className="h-3 w-3" />
              Dispatch
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={retryAll} className="text-xs font-medium underline">
            Retry
          </button>
        </div>
      )}

      <SetupChecklist canDismiss={ADMIN_OPS_ROLES.includes(role)} />

      <KpiCards data={summary.data} loading={summary.loading} />
      <DashboardCharts data={summary.data} loading={summary.loading} />

      <AttentionCenter attention={summary.data?.attention} loading={summary.loading} />
      <RecentActivity items={summary.data?.recentActivity} loading={summary.loading} />

      <div className="space-y-4">
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

      {includeFleet ? (
        <section className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-12 min-[960px]:items-start">
          {/* Dominant ops column — Needs Dispatch / Ready / Delayed */}
          <div className="flex flex-col gap-4 min-[960px]:col-span-7">
            <UnassignedQueue
              orders={boardData?.unassignedOrders ?? []}
              loading={board.loading}
              canDispatch={canCreateDispatch}
            />
            <FleetReady board={boardData} loading={board.loading} canDispatch={canCreateDispatch} />
            <DelayedDeliveries
              orders={summary.data?.delayedOrders.items ?? []}
              total={summary.data?.delayedOrders.total ?? 0}
              loading={summary.loading}
              unassignedIds={unassignedIds}
              canDispatch={canCreateDispatch}
            />
          </div>

          {/* Secondary monitoring — AI / On Road / Money */}
          <div className="flex flex-col gap-4 min-[960px]:col-span-5">
            <AiOpsSuggestions board={boardData ?? null} canDispatch={canCreateDispatch} loading={board.loading} />
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
    </div>
  );
}
