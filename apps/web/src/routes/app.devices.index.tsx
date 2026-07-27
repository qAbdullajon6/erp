import { createFileRoute } from "@tanstack/react-router";
import { DevicesList } from "@/components/fleet-devices/devices-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export type DevicesSearch = {
  page?: number;
  search?: string;
  tab?: string;
  provider?: string;
  create?: boolean;
};

export const Route = createFileRoute("/app/devices/")({
  validateSearch: (search: Record<string, unknown>): DevicesSearch => {
    const out: DevicesSearch = {};
    if (search.page != null && search.page !== "") {
      const page = typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    if (typeof search.search === "string" && search.search) out.search = search.search;
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (typeof search.provider === "string" && search.provider) out.provider = search.provider;
    if (search.create === true || search.create === "true") out.create = true;
    return out;
  },
  head: () => ({
    meta: [{ title: "Devices — FlowERP" }],
  }),
  component: DevicesPage,
});

/// TelematicsDevicesController is ADMIN + OPERATIONS_MANAGER only — mirror it
/// so DISPATCHER cannot hit a 403 via direct URL.
function DevicesPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <DevicesList />
    </ProtectedApiRoute>
  );
}
