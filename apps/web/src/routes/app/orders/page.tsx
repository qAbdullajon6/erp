import { OrdersConnectedView } from "@/components/orders/orders-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export default function OrdersPage() {
  return (
    <ProtectedApiRoute>
      <OrdersConnectedView />
    </ProtectedApiRoute>
  );
}
