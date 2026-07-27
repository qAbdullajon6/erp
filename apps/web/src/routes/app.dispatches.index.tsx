import { createFileRoute } from "@tanstack/react-router";
import { DispatchesList } from "@/components/dispatch/dispatches-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { DISPATCH_ROLES } from "@/lib/role-access";

export type DispatchesSearch = {
  page?: number;
  search?: string;
  tab?: string;
  /// Opens the New Dispatch sheet when true (and when /app/dispatches/create redirects here).
  create?: boolean;
  /// Prefills the create sheet order when deep-linked from Overview / Orders.
  orderId?: string;
};

export const Route = createFileRoute("/app/dispatches/")({
  validateSearch: (search: Record<string, unknown>): DispatchesSearch => {
    const out: DispatchesSearch = {};
    if (search.page != null && search.page !== "") {
      const page = typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    if (typeof search.search === "string" && search.search) out.search = search.search;
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (search.create === true || search.create === "true") out.create = true;
    if (typeof search.orderId === "string" && search.orderId) out.orderId = search.orderId;
    return out;
  },
  component: DispatchesPage,
});

function DispatchesPage() {
  return (
    <ProtectedApiRoute requireRoles={DISPATCH_ROLES}>
      <DispatchesList />
    </ProtectedApiRoute>
  );
}
