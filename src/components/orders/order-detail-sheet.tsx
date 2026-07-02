"use client";

import { ArrowRight, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  formatCurrency,
  formatDateTime,
  getCustomer,
  getOrderExpenses,
  isOrderDelayed,
} from "@/lib/mock-data";
import { delayedStatusMeta, expenseCategoryMeta, nextStatusOptions, orderStatusMeta } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";
import type { Order } from "@/lib/types";

export function OrderDetailSheet({
  order,
  onOpenChange,
}: {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { drivers, vehicles, expenses, customers, updateOrderStatus } = useAppData();

  if (!order) return null;

  const customer = getCustomer(order.customerId, customers);
  const driver = drivers.find((d) => d.id === order.driverId);
  const vehicle = vehicles.find((v) => v.id === order.vehicleId);
  const delayed = isOrderDelayed(order);
  const nextOptions = nextStatusOptions(order.status);
  const orderExpenses = getOrderExpenses(order.id, expenses);
  const totalCost = orderExpenses.reduce((sum, e) => sum + e.amount, 0);
  const profit = order.amount - totalCost;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {order.id}
            <Badge variant="outline" className={orderStatusMeta[order.status].badgeClass}>
              {orderStatusMeta[order.status].label}
            </Badge>
            {delayed && (
              <Badge variant="outline" className={delayedStatusMeta.badgeClass}>
                {delayedStatusMeta.label}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {customer?.name} · {order.origin} <ArrowRight className="inline size-3" />{" "}
            {order.destination}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {nextOptions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nextOptions.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={status === "cancelled" ? "outline" : "default"}
                  className={status === "cancelled" ? "text-destructive" : ""}
                  onClick={() => updateOrderStatus(order.id, status)}
                >
                  Mark as {orderStatusMeta[status].label}
                </Button>
              ))}
            </div>
          )}

          <Separator />

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Contact person</dt>
              <dd className="font-medium">{order.contactPerson}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Operator</dt>
              <dd className="font-medium">{order.operator}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cargo</dt>
              <dd className="font-medium">{order.cargo}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Weight / Packages</dt>
              <dd className="font-medium">
                {order.weightTons}t · {order.packageCount} pkg
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pickup date</dt>
              <dd className="font-medium">{formatDateTime(order.pickupDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Delivery date</dt>
              <dd className={delayed ? "font-medium text-destructive" : "font-medium"}>
                {formatDateTime(order.deliveryDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Driver</dt>
              <dd className="font-medium">{driver?.name ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vehicle</dt>
              <dd className="font-medium">
                {vehicle ? `${vehicle.model} · ${vehicle.plate}` : "Unassigned"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Agreed price</dt>
              <dd className="font-medium">{formatCurrency(order.amount)}</dd>
            </div>
            {order.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="font-medium">{order.notes}</dd>
              </div>
            )}
          </dl>

          {orderExpenses.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Costs & Profit</p>
                <div className="space-y-1.5">
                  {orderExpenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {expenseCategoryMeta[e.category].label}
                      </span>
                      <span>{formatCurrency(e.amount)}</span>
                    </div>
                  ))}
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total cost</span>
                  <span className="font-medium">{formatCurrency(totalCost)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Profit</span>
                  <span
                    className={
                      profit >= 0 ? "font-medium text-chart-2" : "font-medium text-destructive"
                    }
                  >
                    {formatCurrency(profit)}
                  </span>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div>
            <p className="mb-3 text-xs font-medium text-muted-foreground">Status history</p>
            <ol className="space-y-3">
              {[...order.statusHistory].reverse().map((entry, i) => (
                <li key={`${entry.status}-${entry.at}`} className="flex items-start gap-3">
                  <div
                    className={
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full " +
                      (i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
                    }
                  >
                    <Check className="size-3" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{orderStatusMeta[entry.status].label}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
