import { createFileRoute } from "@tanstack/react-router";
import { OrdersDetail } from "@/components/orders/orders-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ALL_STAFF_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/orders/$orderId")({
  head: () => ({
    meta: [{ title: "Order — FlowERP AI" }],
  }),
  component: OrdersDetailPage,
});

function OrdersDetailPage() {
  const { orderId } = Route.useParams();

  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <OrdersDetail orderId={orderId} />
    </ProtectedApiRoute>
  );
}
