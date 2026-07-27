import { createFileRoute } from "@tanstack/react-router";
import { OrdersList } from "@/components/orders/orders-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ALL_STAFF_ROLES } from "@/lib/role-access";

export type OrdersSearch = {
  page?: number;
  search?: string;
  status?: string;
  tab?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /// Opens the New Order sheet when true (and when /app/orders/create redirects here).
  create?: boolean;
};

export const Route = createFileRoute("/app/orders/")({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => {
    const out: OrdersSearch = {};
    if (search.page != null && search.page !== "") {
      const page = typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    if (typeof search.search === "string" && search.search) out.search = search.search;
    if (typeof search.status === "string" && search.status) out.status = search.status;
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (typeof search.sortBy === "string" && search.sortBy) out.sortBy = search.sortBy;
    if (search.sortOrder === "asc" || search.sortOrder === "desc") out.sortOrder = search.sortOrder;
    if (search.create === true || search.create === "true") out.create = true;
    return out;
  },
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <OrdersList />
    </ProtectedApiRoute>
  );
}
