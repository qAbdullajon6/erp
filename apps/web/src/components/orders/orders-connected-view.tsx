"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, PackagePlus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient, type ApiCustomer, type ApiOrder } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

function ConnectedModeBadge() {
  return (
    <Badge variant="outline" className="border-chart-5/30 bg-chart-5/10 text-chart-5">
      Connected Mode — apps/api
    </Badge>
  );
}

function NewOrderForm({
  activeCustomers,
  onCreated,
}: {
  activeCustomers: ApiCustomer[];
  onCreated: () => void;
}) {
  const { callApi } = useApiSession();
  // Not synced via an effect on purpose — this is a plain derived value
  // (state-if-the-user-picked-one, else the first active customer), so
  // there's nothing to keep in sync once the customers list loads
  // asynchronously after this form's first render.
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("");
  const customerId = selectedCustomerId || activeCustomers[0]?.id || "";
  const [pickupCity, setPickupCity] = React.useState("");
  const [pickupDate, setPickupDate] = React.useState("");
  const [deliveryCity, setDeliveryCity] = React.useState("");
  const [deliveryDate, setDeliveryDate] = React.useState("");
  const [cargoDescription, setCargoDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError("Create an active customer first — orders can only be created for active customers.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await callApi((token) =>
        apiClient.createOrder(token, {
          customerId,
          pickupAddress: pickupCity,
          pickupCity,
          pickupDate: new Date(pickupDate).toISOString(),
          deliveryAddress: deliveryCity,
          deliveryCity,
          deliveryDate: new Date(deliveryDate).toISOString(),
          cargoDescription,
          price: Number(price),
        }),
      );
      setPickupCity("");
      setPickupDate("");
      setDeliveryCity("");
      setDeliveryDate("");
      setCargoDescription("");
      setPrice("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  if (activeCustomers.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
        No active customers yet — create one on the Customers page before creating an order.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Customer</Label>
          <Select value={customerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeCustomers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Pickup city</Label>
          <Input value={pickupCity} onChange={(e) => setPickupCity(e.target.value)} className="w-36" required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Pickup date</Label>
          <Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="w-40" required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Delivery city</Label>
          <Input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} className="w-36" required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Delivery date</Label>
          <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-40" required />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Price (USD)</Label>
          <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28" required />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-48">
          <Label className="mb-1 block text-xs text-muted-foreground">Cargo description</Label>
          <Input
            value={cargoDescription}
            onChange={(e) => setCargoDescription(e.target.value)}
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
          <PackagePlus className="size-3.5" />
          {submitting ? "Creating…" : "Create Order"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

type LoadState = "loading" | "loaded" | "error" | "session-expired";

export function OrdersConnectedView() {
  const router = useRouter();
  const { session, logout, callApi } = useApiSession();
  const [orders, setOrders] = React.useState<ApiOrder[]>([]);
  const [customers, setCustomers] = React.useState<ApiCustomer[]>([]);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadState("loading");
      setErrorMessage(null);
    });

    Promise.all([
      callApi((token) =>
        apiClient.listOrders(token, {
          search: search.trim() || undefined,
          limit: 50,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      ),
      callApi((token) => apiClient.listCustomers(token, { limit: 100 })),
    ]).then(
      ([ordersResult, customersResult]) => {
        if (cancelled) return;
        setOrders(ordersResult.items);
        setCustomers(customersResult.items);
        setLoadState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load orders";
        setErrorMessage(message);
        setLoadState(/invalid|expired|unauthorized|not signed in/i.test(message) ? "session-expired" : "error");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [session, search, reloadToken, callApi]);

  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);
  const customerById = React.useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const activeCustomers = React.useMemo(() => customers.filter((c) => c.status === "ACTIVE"), [customers]);

  if (loadState === "session-expired") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Orders</h1>
          <ConnectedModeBadge />
        </div>
        <Card className="mx-auto max-w-md">
          <CardContent className="space-y-3 py-6 text-center">
            <AlertTriangle className="mx-auto size-6 text-destructive" />
            <p className="text-sm font-medium">Your session has expired</p>
            <p className="text-sm text-muted-foreground">Sign in again to continue viewing orders in Connected Mode.</p>
            <Button
              onClick={() => {
                logout();
                router.push("/auth/login?redirect=%2Forders");
              }}
              className="gap-1.5"
            >
              <LogOut className="size-3.5" />
              Sign in again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Orders</h1>
          <ConnectedModeBadge />
        </div>
        {session && (
          <span className="text-sm text-muted-foreground">
            Signed in as {session.user.email} · {session.organization.name}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search order number, city, cargo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loadState === "loading"} className="gap-1.5">
              <RefreshCw className={`size-3.5 ${loadState === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <NewOrderForm activeCustomers={activeCustomers} onCreated={load} />

          {loadState === "loading" && (
            <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading orders…
            </p>
          )}

          {loadState === "error" && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle className="size-5 text-destructive" />
              <p className="text-sm text-destructive">{errorMessage}</p>
              <p className="text-xs text-muted-foreground">Is apps/api running at the configured NEXT_PUBLIC_API_URL?</p>
              <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            </div>
          )}

          {loadState === "loaded" && orders.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No orders yet in this organization. Create one above to get started.
            </p>
          )}

          {loadState === "loaded" && orders.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customerById.get(order.customerId)?.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.pickupCity} → {order.deliveryCity}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline">{order.status}</Badge>
                        {order.isDelayed && (
                          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                            Delayed
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {order.price} {order.currency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This is a transitional foundation view (list, search, create) — assigning drivers/vehicles
        and progressing order status are fully implemented and tested on the API but not wired into
        this view yet. See docs/ORDERS_DISPATCH_API.md.
      </p>
    </div>
  );
}
