import { createFileRoute } from "@tanstack/react-router";
import { OrdersDetail } from "@/components/orders/orders-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/orders/$orderId")({
  component: OrdersDetailPage,
});

function OrdersDetailPage() {
  const { orderId } = Route.useParams();

  return (
    <ProtectedApiRoute>
      <OrdersDetail orderId={orderId} />
    </ProtectedApiRoute>
  );
}
