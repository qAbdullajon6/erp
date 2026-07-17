import { createFileRoute, Link } from "@tanstack/react-router";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DeliveryStatusChart } from "@/components/dashboard/delivery-status-chart";
import { DriverFleetStatus } from "@/components/dashboard/driver-fleet-status";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { DelayedDeliveries } from "@/components/dashboard/delayed-deliveries";
import { DriverDashboardSummary } from "@/components/dashboard/driver-dashboard-summary";
import { LiveDispatch } from "@/components/dashboard/live-dispatch";
import { useCurrentUser } from "@/lib/api/auth";
import { useDashboardData } from "@/lib/api/dashboard";
import type { MembershipRole } from "@/lib/api/organizations";
import { formatMoney } from "@/lib/format";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  Plus,
  Route as RouteIcon,
  Truck,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [{ title: "Operations — Command Center" }],
  }),
  component: DashboardPage,
});

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
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{userError || "Failed to load account."}</p>
        <button onClick={() => refetchUser()} className="mt-3 rounded-lg bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20">
          Retry
        </button>
      </div>
    );
  }

  if (isDriver) return <DriverDashboardSummary firstName={currentUser.user.firstName} />;

  return (
    <OperationsCommandCenter
      role={role as MembershipRole}
      firstName={currentUser.user.firstName}
      includeFleet={FLEET_VISIBLE_ROLES.has(role ?? "")}
    />
  );
}

function OperationsCommandCenter({
  role,
  firstName,
  includeFleet,
}: {
  role: MembershipRole;
  firstName?: string;
  includeFleet: boolean;
}) {
  const { overview, delayedOrders, recentOrders, board, loading, error, refetch } = useDashboardData(includeFleet);
  const totals = overview?.totals;

  const fleet = board && includeFleet ? {
    available: board.drivers.available.length,
    total: board.drivers.available.length + board.drivers.busy.length + board.drivers.onLeave.length,
  } : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      {/* Compact header: greeting + urgent alerts inline */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">Operations overview</p>
        </div>
        {/* Quick create shortcuts */}
        <div className="flex items-center gap-2">
          <Link to="/app/orders/create" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand hover:text-brand">
            <Plus className="h-3 w-3" />
            Order
          </Link>
          <Link to="/app/dispatches/create" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand hover:text-brand">
            <Plus className="h-3 w-3" />
            Dispatch
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
          <button onClick={() => refetch()} className="text-xs font-medium text-destructive hover:underline">Retry</button>
        </div>
      )}

      {/* Urgent alerts banner — only shows if there are delayed orders or unassigned orders */}
      {!loading && totals && ((totals.delayedOrders > 0) || (board && board.unassignedOrders.length > 0)) && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5">
          {totals.delayedOrders > 0 && (
            <Link to="/app/orders" search={{ tab: 'action' }} className="flex items-center gap-2 text-sm font-medium text-warning hover:text-warning/80">
              <AlertTriangle className="h-4 w-4" />
              {totals.delayedOrders} delayed order{totals.delayedOrders === 1 ? '' : 's'}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {board && board.unassignedOrders.length > 0 && (
            <Link to="/app/orders" search={{ tab: 'action' }} className="flex items-center gap-2 text-sm font-medium text-warning hover:text-warning/80">
              <Clock className="h-4 w-4" />
              {board.unassignedOrders.length} unassigned
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {/* KPI strip — compact, one row */}
      <KpiCards totals={totals ?? null} fleet={fleet} loading={loading} />

      {/* Primary operational grid — 2 columns */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Left: 3/5 — charts stacked */}
        <div className="space-y-5 lg:col-span-3">
          <RevenueChart
            data={overview?.revenueVsExpensesTimeSeries ?? []}
            totalRevenue={totals?.totalRevenue ?? null}
            loading={loading}
          />
          {/* Fleet + Live dispatch side by side within the left column */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <LiveDispatch board={includeFleet ? board : null} loading={includeFleet && loading} />
            <DriverFleetStatus board={includeFleet ? board : null} loading={includeFleet && loading} />
          </div>
        </div>

        {/* Right: 2/5 — priority info stack */}
        <div className="space-y-5 lg:col-span-2">
          <DeliveryStatusChart data={overview?.ordersByStatus ?? []} loading={loading} />
          <DelayedDeliveries orders={delayedOrders} loading={loading} />
          <RecentOrdersTable orders={recentOrders} loading={loading} />
        </div>
      </div>
    </div>
  );
}
