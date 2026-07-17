import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortalDashboard } from "@/lib/api/portal-dashboard";
import { formatMoney, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, CheckCircle2, Wallet, Bell, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/portal/")({
  head: () => ({
    meta: [{ title: "Dashboard — Customer Portal" }],
  }),
  component: PortalDashboardPage,
});

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "warning" | "brand" | "success" | "secondary" | "destructive" | "muted"> = {
    PENDING: "warning",
    ASSIGNED: "brand",
    PICKED_UP: "brand",
    IN_TRANSIT: "brand",
    DELIVERED: "success",
    CANCELLED: "destructive",
  };
  return <Badge variant={variantMap[status] ?? "secondary"}>{status.replace(/_/g, " ")}</Badge>;
}

function PortalDashboardPage() {
  const { data: dashboard, loading, error } = usePortalDashboard();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Welcome to your customer portal.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!dashboard) return null;

  const kpis = [
    { icon: Package, label: "Open Orders", value: dashboard.openOrdersCount, color: "text-brand" },
    { icon: CheckCircle2, label: "Delivered This Month", value: dashboard.deliveredThisMonth, color: "text-success" },
    { icon: Wallet, label: "Outstanding Balance", value: formatMoney(dashboard.outstandingBalance), color: "text-destructive" },
    { icon: Bell, label: "Unread Notifications", value: dashboard.unreadNotificationCount, color: "text-warning" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Welcome to your customer portal.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 ${kpi.color}`}>
                <kpi.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Orders</CardTitle>
            <Link
              to="/portal/orders"
              className="flex items-center gap-1 text-sm text-brand hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {dashboard.recentOrders.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No recent orders.</p>
            ) : (
              <div className="space-y-3">
                {dashboard.recentOrders.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    to="/portal/orders/$orderId"
                    params={{ orderId: order.id }}
                    className="flex items-center justify-between rounded-lg border border-border/40 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {order.orderNumber}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.pickupCity} → {order.deliveryCity}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.upcomingDeliveries.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No upcoming deliveries.</p>
            ) : (
              <div className="space-y-3">
                {dashboard.upcomingDeliveries.map((delivery) => (
                  <Link
                    key={delivery.id}
                    to="/portal/orders/$orderId"
                    params={{ orderId: delivery.id }}
                    className="flex items-center justify-between rounded-lg border border-border/40 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {delivery.orderNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {delivery.pickupCity} → {delivery.deliveryCity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Delivery: {formatDate(delivery.deliveryDate)}
                      </p>
                    </div>
                    <StatusBadge status={delivery.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
