import { createFileRoute } from "@tanstack/react-router";
import { OrdersList } from "@/components/orders/orders-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <ProtectedApiRoute>
      <OrdersList />
    </ProtectedApiRoute>
  );
}
