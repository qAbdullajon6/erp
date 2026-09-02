import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Truck, UserRound } from "lucide-react";
import type { BoardOrderSummary, DispatchBoardSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

interface AiOpsSuggestionsProps {
  board: DispatchBoardSummary | null;
  canDispatch: boolean;
  loading?: boolean;
}

interface Suggestion {
  id: string;
  order: BoardOrderSummary;
  driver: DispatchBoardSummary["drivers"]["available"][0];
  vehicle: DispatchBoardSummary["vehicles"]["available"][0] | null;
  reasons: string[];
}

/// Deterministic ops recommendations from the live board snapshot — not a
/// model call. Reasons are only claims we can prove from data we have.
export function buildSuggestions(board: DispatchBoardSummary): Suggestion[] {
  const freeDrivers = [...board.drivers.available];
  const freeVehicles = [...board.vehicles.available];
  if (freeDrivers.length === 0 || board.unassignedOrders.length === 0) return [];

  const now = Date.now();
  const ranked = [...board.unassignedOrders].sort((a, b) => {
    const aLate = new Date(a.deliveryDate).getTime() < now ? 0 : 1;
    const bLate = new Date(b.deliveryDate).getTime() < now ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    return new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime();
  });

  const usedDrivers = new Set<string>();
  const usedVehicles = new Set<string>();
  const out: Suggestion[] = [];

  for (const order of ranked) {
    if (out.length >= 3) break;
    const driver = freeDrivers.find((d) => !usedDrivers.has(d.id));
    if (!driver) break;

    const needKg = order.cargoWeightKg ? Number(order.cargoWeightKg) : null;
    let vehicle: DispatchBoardSummary["vehicles"]["available"][0] | null =
      needKg != null && Number.isFinite(needKg)
        ? (freeVehicles.find(
            (v) =>
              !usedVehicles.has(v.id) && v.capacityKg != null && Number(v.capacityKg) >= needKg,
          ) ?? null)
        : (freeVehicles.find((v) => !usedVehicles.has(v.id)) ?? null);
    if (!vehicle) {
      vehicle = freeVehicles.find((v) => !usedVehicles.has(v.id)) ?? null;
    }

    const reasons: string[] = ["Idle"];
    if (vehicle?.capacityKg && needKg != null && Number(vehicle.capacityKg) >= needKg) {
      reasons.push("Fits cargo");
    } else if (vehicle) {
      reasons.push("Vehicle free");
    } else {
      reasons.push("No vehicle");
    }
    if (new Date(order.deliveryDate).getTime() < now) reasons.unshift("Overdue");

    usedDrivers.add(driver.id);
    if (vehicle) usedVehicles.add(vehicle.id);
    out.push({ id: `${order.id}-${driver.id}`, order, driver, vehicle, reasons });
  }

  return out;
}

export function AiOpsSuggestions({ board, canDispatch, loading }: AiOpsSuggestionsProps) {
  if (loading) return <Skeleton className="h-44 rounded-xl" />;
  if (!board) return null;
  const suggestions = buildSuggestions(board);

  return (
    <SurfaceCard className="flex flex-col">
      <SurfaceCardHeader className="py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Operations</h3>
            <p className="text-[11px] text-muted-foreground">Suggested assignments</p>
          </div>
        </div>
        <Link to="/app/ai-assistant" className="text-[11px] text-muted-foreground hover:text-brand">
          Ask more
        </Link>
      </SurfaceCardHeader>

      {suggestions.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">
          {board.unassignedOrders.length === 0
            ? "Queue clear — nothing to recommend."
            : board.drivers.available.length === 0
              ? "No idle drivers."
              : "No suggestions right now."}
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {suggestions.map((s) => {
            const isOverdue = new Date(s.order.deliveryDate).getTime() < Date.now();
            return (
              <div key={s.id} className="px-4 py-3">
                {/* Suggestion headline */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-foreground">
                      <span className="text-brand">
                        {s.driver.firstName} {s.driver.lastName}
                      </span>
                      {" → "}
                      <Link
                        to="/app/orders/$orderId"
                        params={{ orderId: s.order.id }}
                        className="font-mono text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {s.order.orderNumber}
                      </Link>
                    </p>

                    {/* Route */}
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {s.order.customerName && (
                        <>
                          <span className="truncate font-medium text-foreground/80">
                            {s.order.customerName}
                          </span>
                          <span className="text-border">·</span>
                        </>
                      )}
                      <span className="truncate">{s.order.pickupCity}</span>
                      <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{s.order.deliveryCity}</span>
                    </div>

                    {/* Crew + reason chips */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {isOverdue && (
                        <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                          Overdue
                        </span>
                      )}
                      {s.reasons.filter((r) => r !== "Overdue").map((r) => (
                        <span
                          key={r}
                          className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
                        >
                          {r}
                        </span>
                      ))}
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <UserRound className="h-3 w-3" />
                        {s.driver.employeeCode}
                        {s.vehicle && (
                          <>
                            <span className="text-border">·</span>
                            <Truck className="h-3 w-3" />
                            <span className="font-mono">{s.vehicle.plateNumber}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {canDispatch && (
                    <Link
                      to="/app/dispatches/create"
                      search={{ orderId: s.order.id }}
                      className="shrink-0 self-start rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-foreground hover:opacity-90"
                    >
                      Assign
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SurfaceCard>
  );
}
