import { createFileRoute } from "@tanstack/react-router";
import { ImportWizard } from "@/components/import/import-wizard";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { IMPORT_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/import/")({
  component: ImportPage,
});

function ImportPage() {
  return (
    <ProtectedApiRoute requireRoles={IMPORT_ROLES}>
      <ImportWizard />
    </ProtectedApiRoute>
  );
}
