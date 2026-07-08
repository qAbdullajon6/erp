export function DriverFleetStatus() {
  const fleet = [
    { label: "Available", count: 32, color: "bg-success" },
    { label: "Active", count: 45, color: "bg-brand" },
    { label: "Maintenance", count: 8, color: "bg-warning" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
      <h3 className="font-display text-lg font-bold text-foreground">Fleet Status</h3>
      <p className="mt-1 text-sm text-muted-foreground">Total vehicles: 85</p>
      <div className="mt-6 space-y-4">
        {fleet.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.color} text-white`}>
                {item.count}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
              <div className={`h-full ${item.color}`} style={{ width: `${(item.count / 85) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
