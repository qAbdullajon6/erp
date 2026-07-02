import { AlertTriangle, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRelativeTime, getCustomer, getDriver, orders } from "@/lib/mock-data";

const delayed = orders.filter((o) => o.status === "delayed");

export function DelayedDeliveries() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          Delayed Deliveries
        </CardTitle>
        <CardDescription>
          {delayed.length} order{delayed.length === 1 ? "" : "s"} need attention
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {delayed.length === 0 && (
          <p className="text-sm text-muted-foreground">No delayed deliveries right now.</p>
        )}
        {delayed.map((order) => {
          const customer = getCustomer(order.customerId);
          const driver = getDriver(order.driverId);
          return (
            <div
              key={order.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{order.id} · {customer?.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {order.origin} <ArrowRight className="size-3" /> {order.destination}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {driver ? driver.name : "No driver assigned"}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-destructive">
                ETA {formatRelativeTime(order.eta)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
