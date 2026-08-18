import {
  BarChart3,
  LayoutDashboard,
  Package,
  Route as RouteIcon,
  Sparkles,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./primitives";
import { Reveal } from "./motion";

/// A preview of the actual interface, drawn with the product's own vocabulary:
/// the real sidebar sections, the real `StatusBadge` (so a status is the same
/// colour here as it is inside the app), the real column shape of the orders
/// table.
///
/// What it deliberately is not: a dashboard of results. The previous hero
/// visual showed counters — orders in flight, fleet utilisation, on-time rate —
/// climbing on load, which read as a live customer operation and was entirely
/// invented. Everything below is plainly the shape of a screen: an order
/// number, a route, a status. Nothing here asserts an outcome, and the frame
/// is labelled a preview rather than dressed with a "Live" indicator.
const NAV: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Package, label: "Orders", active: true },
  { icon: RouteIcon, label: "Dispatch" },
  { icon: Truck, label: "Fleet" },
  { icon: Wallet, label: "Finance" },
  { icon: BarChart3, label: "Reports" },
];

const ORDERS: { id: string; route: string; status: string }[] = [
  { id: "ORD-2041", route: "Tashkent → Samarkand", status: "IN_TRANSIT" },
  { id: "ORD-2040", route: "Andijan → Tashkent", status: "ASSIGNED" },
  { id: "ORD-2039", route: "Bukhara → Navoi", status: "DELIVERED" },
  { id: "ORD-2038", route: "Tashkent → Fergana", status: "PENDING" },
];

export function ProductPreview() {
  return (
    <Reveal delay={300} id="product" className="relative mx-auto mt-16 max-w-5xl scroll-mt-24 sm:mt-20">
      <div
        aria-hidden
        className="lv2-wash-soft pointer-events-none absolute -inset-x-8 -top-6 -z-10 h-64"
      />

      <BrowserFrame url="app.flowerp.ai/orders" live={false}>
        {/* The sidebar is desktop-only: at phone widths it would eat half the
            frame and the table — the thing worth showing — would be unreadable. */}
        <div className="grid sm:grid-cols-[180px_1fr]">
          <div className="hidden flex-col gap-0.5 border-r border-border/70 bg-background/30 p-3 sm:flex">
            {NAV.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]",
                  active
                    ? "bg-brand/10 font-medium text-brand"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </div>
            ))}

            <div className="mt-auto flex items-center gap-2.5 rounded-md border border-brand/20 bg-brand/5 px-2.5 py-2 text-[13px] text-brand">
              <Sparkles className="h-4 w-4 shrink-0" />
              AI assistant
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-base font-semibold text-foreground">Orders</h3>
              <span className="text-xs text-muted-foreground">Sorted by pickup date</span>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
              <div className="hidden grid-cols-[auto_1fr_auto] gap-3 border-b border-border/70 bg-background/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Order</span>
                <span>Route</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-border/60">
                {ORDERS.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                    <span className="truncate text-[13px] text-foreground">{order.route}</span>
                    <StatusBadge status={order.status} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-brand" />
              <span className="truncate text-[13px] text-muted-foreground">
                Ask about any order, driver or invoice
              </span>
              <kbd className="ml-auto hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </Reveal>
  );
}
