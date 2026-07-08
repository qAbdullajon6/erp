export function DispatchConnectedView() {
  const dispatches = [
    { id: "DSP-001", route: "Route 14 - Downtown", driver: "Aziz K.", stops: 12, status: "Active", progress: 75 },
    { id: "DSP-002", route: "Route 07 - Suburbs", driver: "Bekzod A.", stops: 8, status: "Active", progress: 50 },
    { id: "DSP-003", route: "Route 21 - Industrial", driver: "Karim M.", stops: 15, status: "In Progress", progress: 30 },
    { id: "DSP-004", route: "Route 05 - Airport", driver: "Dilshod N.", stops: 6, status: "Completed", progress: 100 },
    { id: "DSP-005", route: "Route 12 - Harbor", driver: "Rashid S.", stops: 10, status: "Pending", progress: 0 },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-success/10 text-success";
      case "Active":
        return "bg-brand/10 text-brand";
      case "In Progress":
        return "bg-warning/10 text-warning";
      case "Pending":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Dispatch Management</h1>
        <p className="mt-2 text-muted-foreground">Monitor and manage all dispatch routes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Active Routes</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">7</div>
          <div className="mt-2 text-sm text-brand">Currently dispatching</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Stops Today</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">156</div>
          <div className="mt-2 text-sm text-success">47 completed</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Avg. Time/Stop</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">8m 32s</div>
          <div className="mt-2 text-sm text-success">+5% faster than avg</div>
        </div>
      </div>

      {/* Dispatch Routes */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Active Dispatch Routes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Real-time route tracking and status</p>
        </div>
        <div className="divide-y divide-brand/10">
          {dispatches.map((dispatch) => (
            <div key={dispatch.id} className="border-b border-brand/5 px-8 py-6 transition-colors hover:bg-background/40">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{dispatch.route}</div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Driver: {dispatch.driver}</span>
                    <span>•</span>
                    <span>{dispatch.stops} stops</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(dispatch.status)}`}>
                    {dispatch.status}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold text-foreground">{dispatch.progress}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
                  <div className="h-full bg-gradient-to-r from-brand to-brand/60" style={{ width: `${dispatch.progress}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
