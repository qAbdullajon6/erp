import { createFileRoute } from "@tanstack/react-router";
import { GeofencesWorkspace } from "@/components/fleet-geofences/geofences-workspace";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export type GeofencesSearch = {
  page?: number;
  search?: string;
  tab?: string;
  id?: string;
  create?: boolean;
  eventType?: string;
};

export const Route = createFileRoute("/app/geofences/")({
  validateSearch: (search: Record<string, unknown>): GeofencesSearch => {
    const out: GeofencesSearch = {};
    if (search.page != null && search.page !== "") {
      const page =
        typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    if (typeof search.search === "string" && search.search) {
      out.search = search.search;
    }
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (typeof search.id === "string" && search.id) out.id = search.id;
    if (search.create === true || search.create === "true") out.create = true;
    if (typeof search.eventType === "string" && search.eventType) {
      out.eventType = search.eventType;
    }
    return out;
  },
  head: () => ({
    meta: [{ title: "Geofences — FlowERP" }],
  }),
  component: GeofencesPage,
});

/// GeofencesController read roles: ADMIN / OPERATIONS_MANAGER / DISPATCHER.
/// Write actions are gated in the workspace UI to ADMIN_OPS only.
function GeofencesPage() {
  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <GeofencesWorkspace />
    </ProtectedApiRoute>
  );
}
