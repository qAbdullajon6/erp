import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { MembersSettingsView } from "@/components/settings/members-settings-view";

export default function MembersSettingsPage() {
  return (
    <ProtectedApiRoute requireRole={["ADMIN"]}>
      <MembersSettingsView />
    </ProtectedApiRoute>
  );
}
