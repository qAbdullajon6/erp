import { createFileRoute } from "@tanstack/react-router";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ROUTE_ROLES } from "@/lib/role-access";
import { RouteDetail } from "@/components/routes/route-detail";

export const Route = createFileRoute("/app/routes/$routeId")({
  head: () => ({ meta: [{ title: "Route Detail — FlowERP AI" }] }),
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { routeId } = Route.useParams();
  return (
    <ProtectedApiRoute requireRoles={ROUTE_ROLES}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <RouteDetail routeId={routeId} />
      </div>
    </ProtectedApiRoute>
  );
}
