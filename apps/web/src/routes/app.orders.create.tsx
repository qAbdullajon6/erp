import { createFileRoute } from "@tanstack/react-router";
import { OrdersCreateForm } from "@/components/orders/orders-create-form";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/orders/create")({
  component: OrdersCreatePage,
});

function OrdersCreatePage() {
  return (
    <ProtectedApiRoute>
      <OrdersCreateForm />
    </ProtectedApiRoute>
  );
}
