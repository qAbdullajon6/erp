import { createFileRoute } from "@tanstack/react-router";
import { DriversList } from "@/components/drivers/drivers-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export type DriversSearch = {
  page?: number;
  search?: string;
  tab?: string;
  create?: boolean;
  highlight?: string;
};

export const Route = createFileRoute("/app/drivers/")({
  head: () => ({
    meta: [{ title: "Drivers — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): DriversSearch => {
    const out: DriversSearch = {};
    if (search.page != null && search.page !== "") {
      const page = typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    if (typeof search.search === "string" && search.search) out.search = search.search;
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (search.create === true || search.create === "true") out.create = true;
    if (typeof search.highlight === "string" && search.highlight) out.highlight = search.highlight;
    return out;
  },
  component: DriversPage,
});

function DriversPage() {
  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <DriversList />
    </ProtectedApiRoute>
  );
}
