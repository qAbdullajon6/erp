import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { OrganizationSettingsView } from "@/components/settings/organization-settings-view";

export default function OrganizationSettingsPage() {
  return (
    <ProtectedApiRoute requireRole={["ADMIN"]}>
      <OrganizationSettingsView />
    </ProtectedApiRoute>
  );
}
