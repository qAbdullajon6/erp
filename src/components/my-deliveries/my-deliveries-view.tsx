"use client";

import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, getCustomer, isOrderDelayed } from "@/lib/mock-data";
import { delayedStatusMeta, orderStatusMeta } from "@/lib/status-meta";
import { getDriverNextStatus } from "@/lib/permissions";
import { DEMO_DRIVER_ID } from "@/lib/role";
import { useAppData } from "@/lib/store";
import type { Order, OrderStatus } from "@/lib/types";

const ACTIVE_STATUSES: OrderStatus[] = ["assigned", "picked_up", "in_transit"];

function DeliveryCard({
  order,
  customerName,
  customerPhone,
  onAdvance,
}: {
  order: Order;
  customerName?: string;
  customerPhone?: string;
  onAdvance: (status: OrderStatus) => void;
}) {
  const delayed = isOrderDelayed(order);
  const nextStatus = getDriverNextStatus(order.status);

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{order.id}</span>
          <Badge variant="outline" className={orderStatusMeta[order.status].badgeClass}>
            {orderStatusMeta[order.status].label}
          </Badge>
          {delayed && (
            <Badge variant="outline" className={delayedStatusMeta.badgeClass}>
              {delayedStatusMeta.label}
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
            {order.origin} <ArrowRight className="size-3" /> {order.destination}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="font-medium">{customerName ?? "Unknown"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contact</p>
            <p className="font-medium">
              {order.contactPerson}
              {customerPhone && <span className="text-xs text-muted-foreground"> · {customerPhone}</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cargo</p>
            <p className="font-medium">
              {order.cargo} · {order.weightTons}t
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Delivery due</p>
            <p className={delayed ? "font-medium text-destructive" : "font-medium"}>
              {formatDateTime(order.deliveryDate)}
            </p>
          </div>
        </div>

        {order.notes && (
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">Notes: {order.notes}</p>
        )}

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Status timeline</p>
          <ol className="flex flex-wrap gap-3">
            {order.statusHistory.map((h) => (
              <li key={`${h.status}-${h.at}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3 text-primary" />
                {orderStatusMeta[h.status].label}
              </li>
            ))}
          </ol>
        </div>

        {nextStatus && (
          <Button size="sm" onClick={() => onAdvance(nextStatus)}>
            Mark as {orderStatusMeta[nextStatus].label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function MyDeliveriesView() {
  const { orders, customers, updateOrderStatus } = useAppData();

  const myOrders = orders.filter((o) => o.driverId === DEMO_DRIVER_ID);
  const active = myOrders
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime());
  const history = myOrders
    .filter((o) => !ACTIVE_STATUSES.includes(o.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">My Deliveries</h2>
        <p className="text-sm text-muted-foreground">
          Your assigned deliveries — update the status as you progress through each one.
        </p>
      </div>

      <div className="space-y-4">
        {active.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active deliveries assigned to you right now.
            </CardContent>
          </Card>
        )}
        {active.map((order) => (
          <DeliveryCard
            key={order.id}
            order={order}
            customerName={getCustomer(order.customerId, customers)?.name}
            customerPhone={getCustomer(order.customerId, customers)?.phone}
            onAdvance={(status) => updateOrderStatus(order.id, status)}
          />
        ))}
      </div>

      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Recent deliveries</h3>
          {history.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {order.id} · {order.origin} → {order.destination}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getCustomer(order.customerId, customers)?.name}
                  </p>
                </div>
                <Badge variant="outline" className={orderStatusMeta[order.status].badgeClass}>
                  {orderStatusMeta[order.status].label}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
