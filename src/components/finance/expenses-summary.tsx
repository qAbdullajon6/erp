"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, getExpensesByCategory } from "@/lib/mock-data";
import { expenseCategoryMeta, expenseCategoryOrder } from "@/lib/status-meta";
import { useAppData } from "@/lib/store";

export function ExpensesSummary() {
  const { expenses } = useAppData();
  const totals = getExpensesByCategory(expenses);
  const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Expenses</CardTitle>
        <CardDescription>{formatCurrency(grandTotal)} across all categories</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {expenseCategoryOrder
          .filter((c) => totals[c] > 0)
          .map((c) => {
            const pct = grandTotal > 0 ? (totals[c] / grandTotal) * 100 : 0;
            return (
              <div key={c} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{expenseCategoryMeta[c].label}</span>
                  <span className="font-medium">{formatCurrency(totals[c])}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
