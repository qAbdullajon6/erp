export function FinanceConnectedView() {
  const invoices = [
    { id: "INV-001", customer: "Alfa Trade", amount: "$2,450", date: "2024-07-09", status: "Paid", dueDate: "Paid" },
    { id: "INV-002", customer: "Nexo Retail", amount: "$1,890", date: "2024-07-08", status: "Pending", dueDate: "Due in 5 days" },
    { id: "INV-003", customer: "Silk Freight", amount: "$3,200", date: "2024-07-07", status: "Overdue", dueDate: "Overdue 3 days" },
    { id: "INV-004", customer: "BM Wholesale", amount: "$1,650", date: "2024-07-06", status: "Paid", dueDate: "Paid" },
    { id: "INV-005", customer: "Tech Corp", amount: "$4,100", date: "2024-07-05", status: "Pending", dueDate: "Due in 12 days" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-success/10 text-success";
      case "Pending":
        return "bg-brand/10 text-brand";
      case "Overdue":
        return "bg-destructive/10 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Financial Management</h1>
        <p className="mt-2 text-muted-foreground">Track invoices, payments, and financial metrics</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Monthly Revenue</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">$124.5K</div>
          <div className="mt-2 text-sm text-success">+15.2% vs last month</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Outstanding</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">$18.7K</div>
          <div className="mt-2 text-sm text-warning">From 8 invoices</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-6">
          <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Collection Rate</div>
          <div className="mt-3 font-display text-3xl font-bold text-foreground">94.2%</div>
          <div className="mt-2 text-sm text-success">On track</div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50">
        <div className="border-b border-brand/10 px-8 py-6">
          <h2 className="font-display text-2xl font-bold text-foreground">Recent Invoices</h2>
          <p className="mt-1 text-sm text-muted-foreground">Billing and payment tracking</p>
        </div>
        <div className="divide-y divide-brand/10">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="border-b border-brand/5 px-8 py-5 transition-colors hover:bg-background/40">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-foreground">{invoice.id}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{invoice.customer}</div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="font-semibold text-foreground">{invoice.amount}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{invoice.date}</div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(invoice.status)}`}>
                      {invoice.status}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{invoice.dueDate}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expense Summary */}
      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-gradient-to-br from-surface to-surface/50 p-8">
        <h2 className="font-display text-2xl font-bold text-foreground">Expense Breakdown</h2>
        <div className="mt-6 space-y-4">
          {[
            { label: "Fuel & Logistics", amount: "$28,450", percentage: 35 },
            { label: "Driver Salaries", amount: "$24,200", percentage: 30 },
            { label: "Maintenance", amount: "$18,500", percentage: 23 },
            { label: "Insurance", amount: "$9,800", percentage: 12 },
          ].map((expense) => (
            <div key={expense.label}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{expense.label}</span>
                <span className="font-semibold text-foreground">{expense.amount}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/40">
                <div className="h-full bg-gradient-to-r from-brand to-brand/60" style={{ width: `${expense.percentage}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{expense.percentage}% of total</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
