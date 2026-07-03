import { drivers, formatCurrency, getOnTimeDeliveryRate, getReferenceNow, orders, invoices, expenses } from "@/lib/mock-data";
import { computeExecutiveStats, defaultReportFilters } from "@/lib/reports-data";
import { resolveDateRange } from "@/lib/date-range";

export function KpiShowcaseSection() {
  const bounds = resolveDateRange("this_month", getReferenceNow());
  const stats = computeExecutiveStats({ orders, invoices, expenses }, defaultReportFilters, bounds);
  const onTimeRate = getOnTimeDeliveryRate(orders);
  const availableDrivers = drivers.filter((d) => d.status === "available").length;

  const metrics = [
    { label: "Orders this month", value: String(stats.totalOrders) },
    { label: "On-time delivery rate", value: `${onTimeRate}%` },
    { label: "Revenue this month", value: formatCurrency(stats.revenue) },
    { label: "Drivers available now", value: `${availableDrivers} / ${drivers.length}` },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Live insight into your operations
            </h2>
            <p className="mt-3 text-muted-foreground">
              These figures come from the same executive reporting engine used inside the app.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            Sample data from the demo environment
          </span>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{m.value}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
