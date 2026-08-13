import { useNavigate, useSearch } from '@tanstack/react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentUser } from '@/lib/api/auth';
import type { MembershipRole } from '@/lib/api/organizations';
import { EXPENSE_READ_ROLES, INVOICE_READ_ROLES } from '@/lib/role-access';
import { FinanceDashboard } from './finance-dashboard';
import { InvoicesList } from './invoices-list';
import { ExpensesList } from './expenses-list';

type FinanceTab = 'dashboard' | 'invoices' | 'expenses';

export function FinanceConnectedView() {
  const navigate = useNavigate({ from: '/app/finance' });
  const search = useSearch({ from: '/app/finance' });
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canReadInvoices = Boolean(role && INVOICE_READ_ROLES.includes(role));
  const canReadExpenses = Boolean(role && EXPENSE_READ_ROLES.includes(role));

  const tab: FinanceTab =
    search.tab === 'invoices' && canReadInvoices
      ? 'invoices'
      : search.tab === 'expenses' && canReadExpenses
        ? 'expenses'
        : search.invoiceId && canReadInvoices
          ? 'invoices'
          : 'dashboard';

  const setTab = (next: FinanceTab) => {
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, tab: next === 'dashboard' ? undefined : next }),
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Financial Management</h1>
        <p className="mt-2 text-muted-foreground">Track invoices, payments, and expenses</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FinanceTab)}>
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
