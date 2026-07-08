import { createFileRoute } from "@tanstack/react-router";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DeliveryStatusChart } from "@/components/dashboard/delivery-status-chart";
import { DriverFleetStatus } from "@/components/dashboard/driver-fleet-status";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { DelayedDeliveries } from "@/components/dashboard/delayed-deliveries";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <KpiCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <DeliveryStatusChart />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable />
        </div>
        <div className="space-y-4">
          <DelayedDeliveries />
          <DriverFleetStatus />
        </div>
      </div>
    </div>
  );
}
