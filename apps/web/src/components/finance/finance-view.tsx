"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceDashboardTab } from "@/components/finance/finance-dashboard-tab";
import { InvoiceList } from "@/components/finance/invoice-list";
import { PaymentsView } from "@/components/finance/payments-view";
import { ExpensesView } from "@/components/finance/expenses-view";

export function FinanceView() {
  return (
    <Tabs defaultValue="dashboard">
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="invoices">Invoices</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="expenses">Expenses</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="mt-4">
        <FinanceDashboardTab />
      </TabsContent>

      <TabsContent value="invoices" className="mt-4">
        <InvoiceList />
      </TabsContent>

      <TabsContent value="payments" className="mt-4">
        <PaymentsView />
      </TabsContent>

      <TabsContent value="expenses" className="mt-4">
        <ExpensesView />
      </TabsContent>
    </Tabs>
  );
}
