import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ROUTE_ROLES } from "@/lib/role-access";
import { RoutesListPage } from "@/components/routes/routes-list";
import type { RouteStatus } from "@/lib/api/routes";

type StatusFilter = 'ALL' | RouteStatus;

export interface RoutesSearch {
  routeStatus?: StatusFilter;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export const Route = createFileRoute("/app/routes/")({
  head: () => ({ meta: [{ title: "Routes — FlowERP AI" }] }),
  validateSearch: (search: Record<string, unknown>): RoutesSearch => {
    const out: RoutesSearch = {};
    const validStatuses: StatusFilter[] = ['ALL', 'DRAFT', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (typeof search.routeStatus === 'string' && validStatuses.includes(search.routeStatus as StatusFilter)) {
      out.routeStatus = search.routeStatus as StatusFilter;
    }
    if (typeof search.search === 'string' && search.search) out.search = search.search;
    if (typeof search.fromDate === 'string' && search.fromDate) out.fromDate = search.fromDate;
    if (typeof search.toDate === 'string' && search.toDate) out.toDate = search.toDate;
    return out;
  },
  component: RoutesPage,
});

function RoutesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ProtectedApiRoute requireRoles={ROUTE_ROLES}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <RoutesListPage
          initialStatus={search.routeStatus ?? 'ALL'}
          initialSearch={search.search ?? ''}
          initialFromDate={search.fromDate ?? ''}
          initialToDate={search.toDate ?? ''}
          onStatusChange={(v) => navigate({ search: (prev) => ({ ...prev, routeStatus: v }) })}
          onSearchChange={(v) => navigate({ search: (prev) => ({ ...prev, search: v || undefined }) })}
          onFromDateChange={(v) => navigate({ search: (prev) => ({ ...prev, fromDate: v || undefined }) })}
          onToDateChange={(v) => navigate({ search: (prev) => ({ ...prev, toDate: v || undefined }) })}
        />
      </div>
    </ProtectedApiRoute>
  );
}
