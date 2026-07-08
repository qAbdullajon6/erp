export function DelayedDeliveries() {
  const delayed = [
    { id: "ORD-2024-085", customer: "Tech Corp", delay: "2 hours", reason: "Traffic" },
    { id: "ORD-2024-092", customer: "Global Ltd", delay: "4 hours", reason: "Vehicle issue" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-foreground">⚠️ Delayed Deliveries</h3>
        <span className="rounded-full bg-destructive/20 px-3 py-1 text-sm font-semibold text-destructive">{delayed.length}</span>
      </div>
      <div className="mt-4 space-y-3">
        {delayed.map((item) => (
          <div key={item.id} className="rounded-lg bg-background/60 p-3">
            <div className="text-sm font-medium text-foreground">{item.customer}</div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.id}</span>
              <span className="text-destructive">+{item.delay}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{item.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
