export function RevenueChart() {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl font-bold text-foreground">Revenue Trend</h3>
          <p className="mt-1 text-sm text-muted-foreground">Weekly performance</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold text-foreground">$482K</div>
          <div className="text-sm font-medium text-success">+8.6% vs last week</div>
        </div>
      </div>
      <div className="mt-8 h-64 flex items-center justify-center rounded-xl bg-background/40 text-muted-foreground">
        <div className="text-center">
          <div className="text-sm">Chart visualization</div>
          <div className="mt-2 text-xs text-muted-foreground/70">Revenue data will appear here</div>
        </div>
      </div>
    </div>
  );
}
