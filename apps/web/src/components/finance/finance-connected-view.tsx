import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinanceDashboard } from './finance-dashboard';
import { InvoicesList } from './invoices-list';
import { ExpensesList } from './expenses-list';

export function FinanceConnectedView() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Financial Management</h1>
        <p className="mt-2 text-muted-foreground">Track invoices, payments, and expenses</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="pt-4">
          <FinanceDashboard />
        </TabsContent>
        <TabsContent value="invoices" className="pt-4">
          <InvoicesList />
        </TabsContent>
        <TabsContent value="expenses" className="pt-4">
          <ExpensesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
