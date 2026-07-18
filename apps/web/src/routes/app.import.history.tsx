import { createFileRoute } from "@tanstack/react-router";
import { ImportHistory } from "@/components/import/import-history";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { IMPORT_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/import/history")({
  component: ImportHistoryPage,
});

function ImportHistoryPage() {
  return (
    <ProtectedApiRoute requireRoles={IMPORT_ROLES}>
      <ImportHistory />
    </ProtectedApiRoute>
  );
}
