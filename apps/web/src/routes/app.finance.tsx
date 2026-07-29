import { createFileRoute } from "@tanstack/react-router";
import { FinanceConnectedView } from "@/components/finance/finance-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ALL_STAFF_ROLES } from "@/lib/role-access";

export type FinanceSearch = {
  tab?: "dashboard" | "invoices" | "expenses";
  invoiceId?: string;
};

export const Route = createFileRoute("/app/finance")({
  validateSearch: (search: Record<string, unknown>): FinanceSearch => {
    const tab = search.tab;
    return {
      tab: tab === "invoices" || tab === "expenses" || tab === "dashboard" ? tab : undefined,
      invoiceId: typeof search.invoiceId === "string" && search.invoiceId ? search.invoiceId : undefined,
    };
  },
  component: FinancePage,
});

function FinancePage() {
  const search = Route.useSearch();
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <FinanceConnectedView
        initialTab={search.tab}
        initialInvoiceId={search.invoiceId}
      />
    </ProtectedApiRoute>
  );
}
