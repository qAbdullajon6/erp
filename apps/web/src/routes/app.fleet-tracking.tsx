import { createFileRoute } from "@tanstack/react-router";
import { FleetTrackingScreen } from "../components/fleet-tracking/fleet-tracking-screen";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/fleet-tracking")({
  head: () => ({
    meta: [{ title: "Fleet Tracking — FlowERP" }],
  }),
  component: FleetTrackingPage,
});

/// Live telematics is dispatcher-and-up (TelematicsController's OPS guard), the
/// same set the Drivers/Vehicles screens use — mirror it here so a role the
/// nav hides this from can't reach it by direct URL.
function FleetTrackingPage() {
  return (
    <ProtectedApiRoute requireRoles={FLEET_ROLES}>
      <FleetTrackingScreen />
    </ProtectedApiRoute>
  );
}
