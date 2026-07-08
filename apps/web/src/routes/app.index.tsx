import { createFileRoute } from "@tanstack/react-router";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DeliveryStatusChart } from "@/components/dashboard/delivery-status-chart";
import { DriverFleetStatus } from "@/components/dashboard/driver-fleet-status";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { DelayedDeliveries } from "@/components/dashboard/delayed-deliveries";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [{ title: "Overview — Command Center" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Command Center</h1>
        <p className="mt-2 text-muted-foreground">Welcome back. Here's your operations at a glance.</p>
      </div>

      {/* KPI Cards */}
      <KpiCards />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <div>
          <DeliveryStatusChart />
        </div>
      </div>

      {/* Orders and Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable />
        </div>
        <div className="space-y-6">
          <DelayedDeliveries />
          <DriverFleetStatus />
        </div>
      </div>
    </div>
  );
}
