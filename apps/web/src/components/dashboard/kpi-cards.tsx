export function KpiCards() {
  const kpis = [
    { label: "Orders today", value: "1,284", change: "+12%", trend: "up" },
    { label: "Active fleet", value: "86 / 92", change: "94%", trend: "neutral" },
    { label: "On-time rate", value: "97.4%", change: "+2.1%", trend: "up" },
    { label: "Revenue (wk)", value: "$482K", change: "+8.6%", trend: "up" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="group relative overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6 transition-all duration-200 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10"
        >
          {/* Background glow */}
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand/5 blur-3xl transition-all duration-200 group-hover:bg-brand/10" />

          {/* Content */}
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {kpi.label}
            </div>
            <div className="mt-3 font-display text-3xl font-bold text-foreground">
              {kpi.value}
            </div>
            <div className={`mt-2 text-sm font-medium ${
              kpi.trend === "up"
                ? "text-success"
                : kpi.trend === "down"
                ? "text-destructive"
                : "text-brand"
            }`}>
              {kpi.change}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
