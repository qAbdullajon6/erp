export function OrdersConnectedView() {
  const orders = [
    { id: "ORD-001", customer: "Alfa Trade", date: "2024-07-09", amount: "$2,450", items: 8, status: "Delivered" },
    { id: "ORD-002", customer: "Nexo Retail", date: "2024-07-09", amount: "$1,890", items: 5, status: "In Transit" },
    { id: "ORD-003", customer: "Silk Freight", date: "2024-07-08", amount: "$3,200", items: 12, status: "Processing" },
    { id: "ORD-004", customer: "BM Wholesale", date: "2024-07-08", amount: "$1,650", items: 6, status: "Pending" },
    { id: "ORD-005", customer: "Tech Corp", date: "2024-07-07", amount: "$4,100", items: 15, status: "Delivered" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Delivered":
        return "bg-success/10 text-success";
      case "In Transit":
        return "bg-brand/10 text-brand";
      case "Processing":
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
        <h1 className="font-display text-3xl font-bold text-foreground">Orders Management</h1>
        <p className="mt-2 text-muted-foreground">View and manage all your orders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Total Orders</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">2,847</div>
          <div className="mt-2 text-sm text-success">+12% this month</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Pending</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">124</div>
          <div className="mt-2 text-sm text-warning">Awaiting processing</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">This Week</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">$48.2K</div>
          <div className="mt-2 text-sm text-success">Total value</div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Recent Orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest orders from your system</p>
        </div>
        <div className="divide-y divide-brand/10">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between border-b border-brand/5 px-8 py-5 transition-colors hover:bg-background/40"
            >
              <div className="flex-1">
                <div className="font-semibold text-foreground">{order.id}</div>
                <div className="mt-1 text-sm text-muted-foreground">{order.customer}</div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="text-sm font-medium text-muted-foreground">{order.date}</div>
                  <div className="mt-1 text-xs text-muted-foreground/70">{order.items} items</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-foreground">{order.amount}</div>
                  <div className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                    {order.status}
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
