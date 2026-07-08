import { createFileRoute } from "@tanstack/react-router";
import { MyDeliveriesView } from "@/components/my-deliveries/my-deliveries-view";

export const Route = createFileRoute("/app/my-deliveries")({
  component: MyDeliveriesPage,
});

function MyDeliveriesPage() {
  return <MyDeliveriesView />;
}
