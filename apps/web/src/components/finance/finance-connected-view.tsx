import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentUser } from '@/lib/api/auth';
import type { MembershipRole } from '@/lib/api/organizations';
import { EXPENSE_READ_ROLES, INVOICE_READ_ROLES } from '@/lib/role-access';
import { FinanceDashboard } from './finance-dashboard';
import { InvoicesList } from './invoices-list';
import { ExpensesList } from './expenses-list';

export function FinanceConnectedView() {
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canReadInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));
  const canReadExpenses = Boolean(role && EXPENSE_READ_ROLES.includes(role));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Financial Management</h1>
        <p className="mt-2 text-muted-foreground">Track invoices, payments, and expenses</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          {canReadInvoices && <TabsTrigger value="invoices">Invoices</TabsTrigger>}
          {canReadExpenses && <TabsTrigger value="expenses">Expenses</TabsTrigger>}
        </TabsList>
        <TabsContent value="dashboard" className="pt-4">
          <FinanceDashboard />
        </TabsContent>
        {canReadInvoices && (
          <TabsContent value="invoices" className="pt-4">
            <InvoicesList />
          </TabsContent>
        )}
        {canReadExpenses && (
          <TabsContent value="expenses" className="pt-4">
            <ExpensesList />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
