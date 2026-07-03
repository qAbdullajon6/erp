"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/mock-data";
import { getInvoiceCollectionStats } from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import type { Invoice } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

export function InvoiceCollectionReport({ invoices }: { invoices: Invoice[] }) {
  const stats = getInvoiceCollectionStats(invoices);

  const rows = [
    { label: "Issued", value: `${stats.issuedCount} invoices · ${formatCurrency(stats.issuedAmount)}` },
    { label: "Paid", value: `${stats.paidCount} invoices · ${formatCurrency(stats.paidAmount)}` },
    { label: "Partially paid", value: `${stats.partiallyPaidCount} invoices` },
    {
      label: "Overdue",
      value: `${stats.overdueCount} invoices · ${formatCurrency(stats.overdueAmount)}`,
      tone: stats.overdueCount > 0 ? "text-destructive" : undefined,
    },
    { label: "Collection rate", value: `${stats.collectionRatePercent.toFixed(1)}%` },
    {
      label: "Avg. payment delay",
      value:
        stats.avgPaymentDelayDays === null
          ? "n/a"
          : `${stats.avgPaymentDelayDays > 0 ? "+" : ""}${stats.avgPaymentDelayDays.toFixed(1)} days vs due date`,
    },
  ];

  const exportRows: CsvRow[] = [
    { Metric: "Issued count", Value: stats.issuedCount },
    { Metric: "Issued amount", Value: stats.issuedAmount },
    { Metric: "Paid count", Value: stats.paidCount },
    { Metric: "Paid amount", Value: stats.paidAmount },
    { Metric: "Partially paid count", Value: stats.partiallyPaidCount },
    { Metric: "Overdue count", Value: stats.overdueCount },
    { Metric: "Overdue amount", Value: stats.overdueAmount },
    { Metric: "Collection rate %", Value: Number(stats.collectionRatePercent.toFixed(1)) },
    {
      Metric: "Avg payment delay (days)",
      Value: stats.avgPaymentDelayDays !== null ? Number(stats.avgPaymentDelayDays.toFixed(1)) : "n/a",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Invoice Collection Performance</CardTitle>
            <CardDescription>Within the active filters</CardDescription>
          </div>
          <ExportCsvButton filename="invoice-collection.csv" rows={exportRows} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={r.tone ?? "font-medium"}>{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
