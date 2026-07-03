"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";
import { getReceivablesAging } from "@/lib/reports-data";
import type { CsvRow } from "@/lib/csv-export";
import type { Invoice } from "@/lib/types";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

export function ReceivablesAgingReport({ invoices }: { invoices: Invoice[] }) {
  const buckets = getReceivablesAging(invoices);
  const total = buckets.reduce((sum, b) => sum + b.amount, 0);

  const exportRows: CsvRow[] = buckets.map((b) => ({
    Bucket: b.label,
    Invoices: b.count,
    Amount: b.amount,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Accounts Receivable Aging</CardTitle>
            <CardDescription>{formatCurrency(total)} total outstanding, current snapshot</CardDescription>
          </div>
          <ExportCsvButton filename="receivables-aging.csv" rows={exportRows} />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right">Invoices</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((b) => (
              <TableRow key={b.key}>
                <TableCell className="font-medium">{b.label}</TableCell>
                <TableCell className="text-right">{b.count}</TableCell>
                <TableCell
                  className={
                    b.key !== "current" && b.amount > 0
                      ? "text-right font-medium text-destructive"
                      : "text-right font-medium"
                  }
                >
                  {formatCurrency(b.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
