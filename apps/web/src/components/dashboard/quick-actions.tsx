import { Link } from "@tanstack/react-router";
import { Package, Route as RouteIcon, MapPin, Users, Truck } from "lucide-react";
import type { MembershipRole } from "@/lib/api/organizations";
import { FLEET_ROLES } from "@/lib/role-access";
import { SurfaceCard } from "@/components/ui/surface-card";
import { SectionHeader } from "@/components/ui/section-header";

interface QuickAction {
  icon: typeof Package;
  label: string;
  description: string;
  to: string;
  /// Matches the same role list nav-config.ts uses for the underlying
  /// section — an action a role can't reach is worse than no action.
  roles?: MembershipRole[];
}

const ACTIONS: QuickAction[] = [
  { icon: Package, label: "Order", description: "Start a new shipment", to: "/app/orders/create" },
  { icon: RouteIcon, label: "Dispatch", description: "Assign driver & vehicle", to: "/app/dispatches/create" },
  { icon: MapPin, label: "Customer", description: "Add a new account", to: "/app/customers/create" },
  { icon: Users, label: "Driver", description: "Onboard a driver", to: "/app/drivers/create", roles: FLEET_ROLES },
  { icon: Truck, label: "Vehicle", description: "Register a vehicle", to: "/app/vehicles/create", roles: FLEET_ROLES },
];

export function QuickActions({ role }: { role: MembershipRole }) {
  const actions = ACTIONS.filter((action) => !action.roles || action.roles.includes(role));

  return (
    <SurfaceCard className="p-6">
      <SectionHeader title="Quick Actions" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group flex flex-col items-center gap-2 rounded-xl border border-brand/10 bg-background/40 px-3 py-4 text-center transition-colors hover:border-brand/30 hover:bg-brand/5"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand transition-transform group-hover:scale-110">
              <action.icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-foreground">{action.label}</span>
            <span className="text-xs text-muted-foreground">{action.description}</span>
          </Link>
        ))}
      </div>
    </SurfaceCard>
  );
}
