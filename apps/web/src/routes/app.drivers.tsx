import { createFileRoute } from "@tanstack/react-router";
import { DriversVehiclesView } from "@/components/drivers/drivers-vehicles-view";

export const Route = createFileRoute("/app/drivers")({
  component: DriversPage,
});

function DriversPage() {
  return <DriversVehiclesView />;
}
