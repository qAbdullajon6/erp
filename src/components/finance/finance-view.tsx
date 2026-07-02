"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceSummary } from "@/components/finance/finance-summary";
import { InvoiceTable } from "@/components/finance/invoice-table";
import { TopDebtors } from "@/components/finance/top-debtors";
import { ExpensesView } from "@/components/finance/expenses-view";

export function FinanceView() {
  return (
    <Tabs defaultValue="invoices">
      <TabsList>
        <TabsTrigger value="invoices">Invoices & Payments</TabsTrigger>
        <TabsTrigger value="expenses">Expenses</TabsTrigger>
      </TabsList>

      <TabsContent value="invoices" className="mt-4 space-y-4">
        <FinanceSummary />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <InvoiceTable />
          </div>
          <TopDebtors />
        </div>
      </TabsContent>

      <TabsContent value="expenses" className="mt-4">
        <ExpensesView />
      </TabsContent>
    </Tabs>
  );
}
