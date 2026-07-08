export function KpiCards() {
  const kpis = [
    { label: "Orders today", value: "1,284", change: "+12%" },
    { label: "Active fleet", value: "86 / 92", change: "94%" },
    { label: "On-time rate", value: "97.4%", change: "+2.1%" },
    { label: "Revenue (wk)", value: "$482K", change: "+8.6%" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-border/60 bg-surface/60 p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</div>
          <div className="mt-2 font-display text-2xl font-bold">{kpi.value}</div>
          <div className="text-xs text-success">{kpi.change}</div>
        </div>
      ))}
    </div>
  );
}
