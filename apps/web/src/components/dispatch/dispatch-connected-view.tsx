"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient, type DispatchBoardResult } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

function ConnectedModeBadge() {
  return (
    <Badge variant="outline" className="border-chart-5/30 bg-chart-5/10 text-chart-5">
      Connected Mode — apps/api
    </Badge>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

type LoadState = "loading" | "loaded" | "error" | "session-expired";

export function DispatchConnectedView() {
  const router = useRouter();
  const { session, logout, callApi } = useApiSession();
  const [board, setBoard] = React.useState<DispatchBoardResult | null>(null);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadState("loading");
      setErrorMessage(null);
    });

    callApi((token) => apiClient.dispatchBoard(token)).then(
      (result) => {
        if (cancelled) return;
        setBoard(result);
        setLoadState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load the dispatch board";
        setErrorMessage(message);
        setLoadState(/invalid|expired|unauthorized|not signed in/i.test(message) ? "session-expired" : "error");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [session, reloadToken, callApi]);

  const load = React.useCallback(() => setReloadToken((n) => n + 1), []);

  if (loadState === "session-expired") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Dispatch Board</h1>
          <ConnectedModeBadge />
        </div>
        <Card className="mx-auto max-w-md">
          <CardContent className="space-y-3 py-6 text-center">
            <AlertTriangle className="mx-auto size-6 text-destructive" />
            <p className="text-sm font-medium">Your session has expired</p>
            <p className="text-sm text-muted-foreground">Sign in again to continue viewing dispatch in Connected Mode.</p>
            <Button
              onClick={() => {
                logout();
                router.push("/auth/login?redirect=%2Fdispatch");
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

  const isEmptyOrg =
    board !== null &&
    board.unassignedOrders.length === 0 &&
    board.drivers.available.length === 0 &&
    board.drivers.busy.length === 0 &&
    board.drivers.onLeave.length === 0 &&
    board.drivers.inactive.length === 0 &&
    board.vehicles.available.length === 0 &&
    board.vehicles.busy.length === 0 &&
    board.vehicles.inUse.length === 0 &&
    board.vehicles.maintenance.length === 0 &&
    board.vehicles.inactive.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Dispatch Board</h1>
          <ConnectedModeBadge />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loadState === "loading"} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${loadState === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loadState === "loading" && (
        <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading dispatch board…
        </p>
      )}

      {loadState === "error" && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <AlertTriangle className="size-5 text-destructive" />
          <p className="text-sm text-destructive">{errorMessage}</p>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {loadState === "loaded" && board && isEmptyOrg && (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <p className="text-sm font-medium">Your dispatch board is empty</p>
            <p className="text-sm text-muted-foreground">
              Add drivers, vehicles, and orders (via the API — see docs/ORDERS_DISPATCH_API.md) to see
              them appear here. This is expected for a brand-new organization.
            </p>
          </CardContent>
        </Card>
      )}

      {loadState === "loaded" && board && !isEmptyOrg && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={`Unassigned Orders (${board.unassignedOrders.length})`}>
            {board.unassignedOrders.length === 0 ? (
              <EmptyRow text="Nothing waiting to be dispatched right now." />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {board.unassignedOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{o.orderNumber}</span>
                    <span className="text-muted-foreground">
                      {o.pickupCity} → {o.deliveryCity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Drivers">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{board.drivers.available.length}</span> available:{" "}
                {board.drivers.available.map((d) => `${d.firstName} ${d.lastName}`).join(", ") || "—"}
              </p>
              <p>
                <span className="font-medium">{board.drivers.busy.length}</span> busy:{" "}
                {board.drivers.busy
                  .map((b) => `${b.driver.firstName} ${b.driver.lastName} (${b.currentOrder.orderNumber})`)
                  .join(", ") || "—"}
              </p>
              <p className="text-muted-foreground">
                {board.drivers.onLeave.length} on leave · {board.drivers.inactive.length} inactive
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Vehicles">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{board.vehicles.available.length}</span> available:{" "}
                {board.vehicles.available.map((v) => v.plateNumber).join(", ") || "—"}
              </p>
              <p>
                <span className="font-medium">{board.vehicles.busy.length}</span> busy:{" "}
                {board.vehicles.busy
                  .map((b) => `${b.vehicle.plateNumber} (${b.currentOrder.orderNumber})`)
                  .join(", ") || "—"}
              </p>
              <p className="text-muted-foreground">
                {board.vehicles.inUse.length} in use · {board.vehicles.maintenance.length} in maintenance ·{" "}
                {board.vehicles.inactive.length} inactive
              </p>
            </div>
          </SectionCard>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        This is a read-only foundation view of GET /dispatch/board. Assigning orders from here isn&apos;t
        wired up yet — use the API directly (see docs/ORDERS_DISPATCH_API.md) until a future phase adds
        it to this UI.
      </p>
    </div>
  );
}
