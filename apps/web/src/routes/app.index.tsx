import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plus, Route as RouteIcon } from "lucide-react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DeliveryStatusChart } from "@/components/dashboard/delivery-status-chart";
import { DriverFleetStatus } from "@/components/dashboard/driver-fleet-status";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { DelayedDeliveries } from "@/components/dashboard/delayed-deliveries";
import { DriverDashboardSummary } from "@/components/dashboard/driver-dashboard-summary";
import { useCurrentUser } from "@/lib/api/auth";
import { useDashboardData } from "@/lib/api/dashboard";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [{ title: "Overview — Command Center" }],
  }),
  component: DashboardPage,
});

/// Roles allowed on DispatchController.board() — everyone else (currently
/// SALES_CRM_MANAGER) has no fleet visibility, so the dashboard must not
/// call that endpoint for them (it would 403).
const FLEET_VISIBLE_ROLES = new Set(["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"]);

function DashboardPage() {
  const { data: currentUser, loading: userLoading, error: userError, refetch: refetchUser } = useCurrentUser();
  const role = currentUser?.membership.role;
  const isDriver = role === "DRIVER";

  if (userLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-primary/5" />;
  }

  if (userError || !currentUser) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{userError || "Failed to load your account."}</p>
        <button
          onClick={() => refetchUser()}
          className="mt-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isDriver) {
    return <DriverDashboardSummary firstName={currentUser.user.firstName} />;
  }

  return <OperationsDashboard includeFleet={FLEET_VISIBLE_ROLES.has(role ?? "")} />;
}

function OperationsDashboard({ includeFleet }: { includeFleet: boolean }) {
  const { overview, delayedOrders, recentOrders, board, loading, error, refetch } = useDashboardData(includeFleet);

  const fleet =
    board && includeFleet
      ? {
          available: board.drivers.available.length,
          total:
            board.drivers.available.length +
            board.drivers.busy.length +
            ((board.drivers.onLeave as unknown[] | undefined)?.length ?? 0),
        }
      : null;

  return (
    <div className="space-y-6">
      {/* Page Header — the two actions that start every logistics workflow are
          here rather than buried one navigation click deep. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Command Center</h1>
          <p className="mt-2 text-muted-foreground">Welcome back. Here's your operations at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/app/dispatches/create">
              <RouteIcon className="h-4 w-4" />
              New dispatch
            </Link>
          </Button>
          <Button asChild className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90">
            <Link to="/app/orders/create">
              <Plus className="h-4 w-4" />
              New order
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-4">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <KpiCards totals={overview?.totals ?? null} fleet={fleet} loading={loading} />

      {/* Charts Grid — items-stretch so the narrow status card matches the
          chart's height instead of leaving a well of empty surface beneath it. */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart
            data={overview?.revenueVsExpensesTimeSeries ?? []}
            totalRevenue={overview?.totals.totalRevenue ?? null}
            loading={loading}
          />
        </div>
        <div>
          <DeliveryStatusChart data={overview?.ordersByStatus ?? []} loading={loading} />
        </div>
      </div>

      {/* Orders and Alerts */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable orders={recentOrders} loading={loading} />
        </div>
        <div className="space-y-6">
          <DelayedDeliveries orders={delayedOrders} loading={loading} />
          <DriverFleetStatus board={includeFleet ? board : null} loading={includeFleet && loading} />
        </div>
      </div>
    </div>
  );
}
