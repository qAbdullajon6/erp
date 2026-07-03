import { CustomersView } from "@/components/customers/customers-view";
import { CustomersConnectedView } from "@/components/customers/customers-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { getDataMode } from "@/lib/data-mode";

export default function CustomersPage() {
  if (getDataMode() !== "api") {
    return <CustomersView />;
  }

  return (
    <ProtectedApiRoute>
      <CustomersConnectedView />
    </ProtectedApiRoute>
  );
}
