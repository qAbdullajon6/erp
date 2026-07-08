export function CustomersConnectedView() {
  const customers = [
    { id: "CUST-001", name: "Alfa Trade", email: "info@alfatrade.uz", phone: "+998 71 200 01 02", status: "Active", orders: 28, revenue: "$18,450" },
    { id: "CUST-002", name: "Nexo Retail", email: "hello@nexoretail.uz", phone: "+998 71 300 02 03", status: "Active", orders: 15, revenue: "$12,890" },
    { id: "CUST-003", name: "Silk Freight", email: "contact@silkfreight.uz", phone: "+998 71 400 03 04", status: "Inactive", orders: 8, revenue: "$8,200" },
    { id: "CUST-004", name: "BM Wholesale", email: "sales@bmwholesale.uz", phone: "+998 71 500 04 05", status: "Active", orders: 42, revenue: "$25,600" },
    { id: "CUST-005", name: "Tech Corp", email: "procurement@techcorp.uz", phone: "+998 71 600 05 06", status: "Active", orders: 19, revenue: "$16,750" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-success/10 text-success";
      case "Inactive":
        return "bg-muted text-muted-foreground";
      case "Pending":
        return "bg-warning/10 text-warning";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Customer Management</h1>
        <p className="mt-2 text-muted-foreground">Manage customer accounts and relationships</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Total Customers</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">842</div>
          <div className="mt-2 text-sm text-success">+24 this month</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Active Accounts</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">756</div>
          <div className="mt-2 text-sm text-brand">89.8% engagement</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Lifetime Value</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">$2.4M</div>
          <div className="mt-2 text-sm text-success">Avg. $2,850 per customer</div>
        </div>
      </div>

      {/* Customers List */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Top Customers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your most valuable accounts</p>
        </div>
        <div className="divide-y divide-brand/10">
          {customers.map((customer) => (
            <div key={customer.id} className="border-b border-brand/5 px-8 py-6 transition-colors hover:bg-background/40">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{customer.name}</div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>📧 {customer.email}</span>
                    <span>•</span>
                    <span>📱 {customer.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">Orders</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{customer.orders}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">Total Spent</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{customer.revenue}</div>
                  </div>
                  <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(customer.status)}`}>
                    {customer.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Segments */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8">
        <h2 className="font-display text-2xl font-bold text-foreground">Customer Segments</h2>
        <div className="mt-6 space-y-4">
          {[
            { label: "Enterprise", count: 45, color: "bg-brand" },
            { label: "Mid-Market", count: 156, color: "bg-success" },
            { label: "SMB", count: 521, color: "bg-warning" },
            { label: "Startup", count: 120, color: "bg-muted" },
          ].map((segment) => (
            <div key={segment.label}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{segment.label}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${segment.color} text-white`}>
                  {segment.count}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
                <div className={`h-full ${segment.color}`} style={{ width: `${(segment.count / 842) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
