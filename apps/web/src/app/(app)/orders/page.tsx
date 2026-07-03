import { OrdersView } from "@/components/orders/orders-view";
import { OrdersConnectedView } from "@/components/orders/orders-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { getDataMode } from "@/lib/data-mode";

export default function OrdersPage() {
  if (getDataMode() !== "api") {
    return <OrdersView />;
  }

  return (
    <ProtectedApiRoute>
      <OrdersConnectedView />
    </ProtectedApiRoute>
  );
}
