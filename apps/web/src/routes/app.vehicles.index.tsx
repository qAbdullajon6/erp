import { createFileRoute } from "@tanstack/react-router";
import { VehiclesList } from "@/components/vehicles/vehicles-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export type VehiclesSearch = {
  page?: number;
  search?: string;
  tab?: string;
  create?: boolean;
  highlight?: string;
};

export const Route = createFileRoute("/app/vehicles/")({
  validateSearch: (search: Record<string, unknown>): VehiclesSearch => {
    const out: VehiclesSearch = {};
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
  component: VehiclesPage,
});

function VehiclesPage() {
  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <VehiclesList />
    </ProtectedApiRoute>
  );
}
