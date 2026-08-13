import { createFileRoute } from "@tanstack/react-router";
import { FinanceConnectedView } from "@/components/finance/finance-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ALL_STAFF_ROLES } from "@/lib/role-access";
import { asSearchString } from "@/lib/search-params";

export type FinanceSearch = {
  tab?: "dashboard" | "invoices" | "expenses";
  invoiceId?: string;
  /// Distinct per-entity names (rather than shared `search`/`status`/`page`)
  /// so switching tabs never leaves one tab's filter state to be misread as
  /// another's — Dashboard/Invoices/Expenses share this one route's URL.
  invoiceSearch?: string;
  invoiceStatus?: string;
  invoicePage?: number;
  expenseSearch?: string;
  expenseStatus?: string;
  expenseCategory?: string;
  expensePage?: number;
};

function parsePage(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const Route = createFileRoute("/app/finance")({
  validateSearch: (search: Record<string, unknown>): FinanceSearch => {
    const tab = search.tab;
    return {
      tab: tab === "invoices" || tab === "expenses" || tab === "dashboard" ? tab : undefined,
      invoiceId: asSearchString(search.invoiceId),
      invoiceSearch: asSearchString(search.invoiceSearch),
      invoiceStatus: asSearchString(search.invoiceStatus),
      invoicePage: parsePage(search.invoicePage),
      expenseSearch: asSearchString(search.expenseSearch),
      expenseStatus: asSearchString(search.expenseStatus),
      expenseCategory: asSearchString(search.expenseCategory),
      expensePage: parsePage(search.expensePage),
    };
  },
  component: FinancePage,
});

function FinancePage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <FinanceConnectedView />
    </ProtectedApiRoute>
  );
}
