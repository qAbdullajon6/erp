export function RecentOrdersTable() {
  const orders = [
    { id: "ORD-2024-001", customer: "Alfa Trade", amount: "$2,450", status: "Delivered", time: "2 hours ago" },
    { id: "ORD-2024-002", customer: "Nexo Retail", amount: "$1,890", status: "In Transit", time: "4 hours ago" },
    { id: "ORD-2024-003", customer: "Silk Freight", amount: "$3,200", status: "Processing", time: "6 hours ago" },
    { id: "ORD-2024-004", customer: "BM Wholesale", amount: "$1,650", status: "Delivered", time: "1 day ago" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Delivered":
        return "bg-success/10 text-success";
      case "In Transit":
        return "bg-brand/10 text-brand";
      case "Processing":
        return "bg-warning/10 text-warning";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
      <div className="border-b border-brand/10 px-8 py-6">
        <h3 className="font-display text-2xl font-bold text-foreground">Recent Orders</h3>
        <p className="mt-1 text-sm text-muted-foreground">Latest deliveries and shipments</p>
      </div>
      <div className="divide-y divide-brand/10">
        {orders.map((order) => (
          <div key={order.id} className="flex items-center justify-between border-b border-brand/5 px-8 py-4 transition-colors hover:bg-background/40">
            <div className="flex-1">
              <div className="font-medium text-foreground">{order.customer}</div>
              <div className="mt-1 text-sm text-muted-foreground">{order.id}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-foreground">{order.amount}</div>
              <div className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(order.status)}`}>
                {order.status}
              </div>
            </div>
            <div className="ml-6 text-right text-sm text-muted-foreground">{order.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
