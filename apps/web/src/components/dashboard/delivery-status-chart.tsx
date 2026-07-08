export function DeliveryStatusChart() {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8">
      <div>
        <h3 className="font-display text-2xl font-bold text-foreground">Delivery Status</h3>
        <p className="mt-1 text-sm text-muted-foreground">Today's deliveries</p>
      </div>
      <div className="mt-8 space-y-4">
        {[
          { label: "Completed", value: 234, color: "bg-success" },
          { label: "In Progress", value: 156, color: "bg-brand" },
          { label: "Pending", value: 42, color: "bg-warning" },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-semibold text-foreground">{item.value}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
              <div className={`h-full ${item.color}`} style={{ width: `${(item.value / 432) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
