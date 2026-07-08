import { CustomersConnectedView } from "@/components/customers/customers-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export default function CustomersPage() {
  return (
    <ProtectedApiRoute>
      <CustomersConnectedView />
    </ProtectedApiRoute>
  );
}
