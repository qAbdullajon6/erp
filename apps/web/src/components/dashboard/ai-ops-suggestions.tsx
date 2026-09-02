import { Link } from "@tanstack/react-router";
import { Sparkles, Truck, UserRound } from "lucide-react";
import type { BoardOrderSummary, DispatchBoardSummary } from "@/lib/api/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceCard, SurfaceCardHeader } from "@/components/ui/surface-card";

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
/// model call. Reasons are only claims we can prove from data we have:
/// Idle (driver free), Fits capacity (kg), Available vehicle. "Nearest" is
/// omitted until pickup/vehicle coords exist on this payload.
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
        ? freeVehicles.find((v) => !usedVehicles.has(v.id) && v.capacityKg != null && Number(v.capacityKg) >= needKg) ??
          null
        : freeVehicles.find((v) => !usedVehicles.has(v.id)) ?? null;
    if (!vehicle) {
      vehicle = freeVehicles.find((v) => !usedVehicles.has(v.id)) ?? null;
    }

    const reasons: string[] = ["Idle"];
    if (vehicle?.capacityKg && needKg != null && Number(vehicle.capacityKg) >= needKg) {
      reasons.push("Fits capacity");
    } else if (vehicle) {
      reasons.push("Vehicle free");
    } else {
      reasons.push("No idle vehicle");
    }
    if (new Date(order.deliveryDate).getTime() < now) reasons.unshift("Delayed — urgent");

    usedDrivers.add(driver.id);
    if (vehicle) usedVehicles.add(vehicle.id);
    out.push({ id: `${order.id}-${driver.id}`, order, driver, vehicle, reasons });
  }

  return out;
}

export function AiOpsSuggestions({ board, canDispatch, loading }: AiOpsSuggestionsProps) {
  if (loading) return <Skeleton className="h-48 rounded-xl" />;
  if (!board) return null;
  const suggestions = buildSuggestions(board);

  return (
    <SurfaceCard className="flex flex-col border-brand/20 bg-gradient-to-br from-brand/[0.06] to-surface">
      <SurfaceCardHeader className="py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-brand" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Operations</h3>
            <p className="text-[11px] text-muted-foreground">Suggested assignments · live board</p>
          </div>
        </div>
        <Link to="/app/ai-assistant" className="text-[11px] font-medium text-brand hover:underline">
          Ask more
        </Link>
      </SurfaceCardHeader>

      {suggestions.length === 0 ? (
        <p className="px-4 py-4 text-xs text-muted-foreground">
          {board.unassignedOrders.length === 0
            ? "Queue clear — nothing to recommend."
            : board.drivers.available.length === 0
              ? "No free drivers to recommend."
              : "No recommendation right now."}
        </p>
      ) : (
        <div className="divide-y divide-brand/10">
          {suggestions.map((s) => (
            <div key={s.id} className="space-y-2 px-3 py-2.5">
              <p className="text-[13px] font-medium text-foreground">
                Assign{" "}
                <span className="text-brand">
                  {s.driver.firstName} {s.driver.lastName}
                </span>{" "}
                to{" "}
                <Link
                  to="/app/orders/$orderId"
                  params={{ orderId: s.order.id }}
                  className="font-mono text-foreground underline-offset-2 hover:underline"
                >
                  {s.order.orderNumber}
                </Link>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {s.order.customerName ? `${s.order.customerName} · ` : ""}
                {s.order.pickupCity} → {s.order.deliveryCity}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.reasons.map((r) => (
                  <span
                    key={r}
                    className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand"
                  >
                    {r}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3 w-3" />
                  {s.driver.employeeCode}
                </span>
                {s.vehicle && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Truck className="h-3 w-3" />
                    {s.vehicle.plateNumber}
                    {s.vehicle.capacityKg ? ` · ${s.vehicle.capacityKg}kg` : ""}
                  </span>
                )}
                {canDispatch && (
                  <Link
                    to="/app/dispatches/create"
                    search={{ orderId: s.order.id }}
                    className="ml-auto rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-foreground hover:opacity-90"
                  >
                    Assign
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}
