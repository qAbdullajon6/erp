import { createFileRoute } from "@tanstack/react-router";
import { ImportDetail } from "@/components/import/import-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { IMPORT_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/import/$sessionId")({
  component: ImportDetailPage,
});

function ImportDetailPage() {
  const { sessionId } = Route.useParams();
  return (
    <ProtectedApiRoute requireRoles={IMPORT_ROLES}>
      <ImportDetail sessionId={sessionId} />
    </ProtectedApiRoute>
  );
}
