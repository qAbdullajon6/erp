import { createFileRoute } from "@tanstack/react-router";
import { FleetTrackingScreen } from "../components/fleet-tracking/fleet-tracking-screen";
import { parseFleetTrackingSearch } from "../components/fleet-tracking/fleet-tracking-hardening";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { FLEET_ROLES } from "@/lib/role-access";

export type FleetTrackingSearch = {
  /// Deep-link selection — UUID of a vehicle in the live fleet.
  vehicleId?: string;
};

export const Route = createFileRoute("/app/fleet-tracking")({
  validateSearch: (search: Record<string, unknown>): FleetTrackingSearch =>
    parseFleetTrackingSearch(search),
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
