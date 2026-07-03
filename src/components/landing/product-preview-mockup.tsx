import { AlertTriangle, Package, Truck, Wallet } from "lucide-react";

const kpis = [
  { label: "Today's Orders", value: "18", icon: Package, tone: "text-primary bg-primary/10" },
  { label: "Active Deliveries", value: "9", icon: Truck, tone: "text-chart-2 bg-chart-2/10" },
  { label: "Revenue (14d)", value: "$46,200", icon: Wallet, tone: "text-chart-3 bg-chart-3/10" },
  { label: "Pending Payments", value: "$8,450", icon: AlertTriangle, tone: "text-chart-4 bg-chart-4/10" },
];

const bars = [40, 65, 50, 80, 60, 90, 72];

const rows = [
  { id: "ORD-2026-00207", route: "Tashkent → Almaty", status: "In Transit" },
  { id: "ORD-2026-00204", route: "Nukus → Urgench", status: "Assigned" },
  { id: "ORD-2026-00209", route: "Fergana → Tashkent", status: "Delivered" },
];

/** A carefully composed illustrative UI mockup — not a live screenshot or real data. */
export function ProductPreviewMockup() {
  return (
    <div className="rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-primary/10">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
        <span className="size-2.5 rounded-full bg-destructive/40" />
        <span className="size-2.5 rounded-full bg-chart-3/50" />
        <span className="size-2.5 rounded-full bg-chart-2/50" />
        <span className="ml-3 text-[11px] text-muted-foreground">flowerp.ai/dashboard</span>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-border/70 bg-background p-2.5">
              <div className={`mb-2 flex size-6 items-center justify-center rounded-md ${kpi.tone}`}>
                <kpi.icon className="size-3.5" />
              </div>
              <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              <p className="text-sm font-semibold tracking-tight">{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <div className="rounded-lg border border-border/70 bg-background p-3 sm:col-span-3">
            <p className="mb-2 text-[10px] text-muted-foreground">Revenue trend</p>
            <div className="flex h-16 items-end gap-1.5">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-3 sm:col-span-2">
            <p className="mb-2 text-[10px] text-muted-foreground">Recent orders</p>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-[10px]">
                  <span className="font-medium">{r.id}</span>
                  <span className="text-muted-foreground">{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
