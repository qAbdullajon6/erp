export function DriversVehiclesView() {
  const drivers = [
    { id: "DRV-001", name: "Aziz K.", phone: "+998 90 123 45 67", status: "Active", vehicle: "Toyota Hiace", miles: "2,450 km", rating: 4.8 },
    { id: "DRV-002", name: "Bekzod A.", phone: "+998 91 234 56 78", status: "Active", vehicle: "Isuzu NPR", miles: "1,890 km", rating: 4.6 },
    { id: "DRV-003", name: "Karim M.", phone: "+998 92 345 67 89", status: "On Break", vehicle: "Mercedes Sprinter", miles: "3,200 km", rating: 4.9 },
    { id: "DRV-004", name: "Dilshod N.", phone: "+998 93 456 78 90", status: "Active", vehicle: "Ford Transit", miles: "1,650 km", rating: 4.7 },
    { id: "DRV-005", name: "Rashid S.", phone: "+998 94 567 89 01", status: "Inactive", vehicle: "Hyundai H350", miles: "4,100 km", rating: 4.5 },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-success/10 text-success";
      case "On Break":
        return "bg-warning/10 text-warning";
      case "Inactive":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Drivers & Fleet Management</h1>
        <p className="mt-2 text-muted-foreground">Manage your drivers and track vehicle status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Total Drivers</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">45</div>
          <div className="mt-2 text-sm text-success">32 active</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Total Vehicles</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">38</div>
          <div className="mt-2 text-sm text-brand">All operational</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Avg. Rating</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">4.7⭐</div>
          <div className="mt-2 text-sm text-success">Excellent performance</div>
        </div>
      </div>

      {/* Drivers List */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Driver Roster</h2>
          <p className="mt-1 text-sm text-muted-foreground">Active drivers and their assigned vehicles</p>
        </div>
        <div className="divide-y divide-brand/10">
          {drivers.map((driver) => (
            <div key={driver.id} className="border-b border-brand/5 px-8 py-6 transition-colors hover:bg-background/40">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{driver.name}</div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>📱 {driver.phone}</span>
                    <span>•</span>
                    <span>🚗 {driver.vehicle}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">Mileage</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{driver.miles}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">Rating</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{driver.rating}</div>
                  </div>
                  <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(driver.status)}`}>
                    {driver.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
