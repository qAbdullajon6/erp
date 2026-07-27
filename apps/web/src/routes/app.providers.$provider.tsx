import { createFileRoute } from "@tanstack/react-router";
import { ProvidersDetail } from "@/components/fleet-providers/providers-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ADMIN_OPS_ROLES } from "@/lib/role-access";

export type ProviderDetailSearch = {
  page?: number;
  search?: string;
  tab?: string;
  deviceId?: string;
  create?: boolean;
};

export const Route = createFileRoute("/app/providers/$provider")({
  validateSearch: (search: Record<string, unknown>): ProviderDetailSearch => {
    const out: ProviderDetailSearch = {};
    if (search.page != null && search.page !== "") {
      const page =
        typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    if (typeof search.search === "string" && search.search) {
      out.search = search.search;
    }
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (typeof search.deviceId === "string" && search.deviceId) {
      out.deviceId = search.deviceId;
    }
    if (search.create === true || search.create === "true") out.create = true;
    return out;
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.provider} — GPS Providers — FlowERP` }],
  }),
  component: ProviderDetailPage,
});

function ProviderDetailPage() {
  return (
    <ProtectedApiRoute requireRoles={ADMIN_OPS_ROLES}>
      <ProvidersDetail />
    </ProtectedApiRoute>
  );
}
