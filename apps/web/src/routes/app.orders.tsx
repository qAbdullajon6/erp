import { createFileRoute } from "@tanstack/react-router";
import { OrdersConnectedView } from "@/components/orders/orders-connected-view";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <ProtectedApiRoute>
      <OrdersConnectedView />
    </ProtectedApiRoute>
  );
}
