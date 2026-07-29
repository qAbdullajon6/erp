import { useNavigate } from "@tanstack/react-router";
import { Package, Route as RouteIcon, MapPin, Truck, Users, Cpu } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { NavItem } from "@/components/layout/nav-config";
import type { MembershipRole } from "@/lib/api/organizations";
import {
  ADMIN_OPS_ROLES,
  CUSTOMER_WRITE_ROLES,
  DISPATCH_WRITE_ROLES,
  FLEET_ROLES,
  ORDER_WRITE_ROLES,
} from "@/lib/role-access";

type QuickAction = {
  icon: typeof Package;
  label: string;
  path: string;
  roles: readonly MembershipRole[];
};

const QUICK_ACTIONS: QuickAction[] = [
  { icon: Package, label: "New order", path: "/app/orders/create", roles: ORDER_WRITE_ROLES },
  {
    icon: RouteIcon,
    label: "New dispatch",
    path: "/app/dispatches/create",
    roles: DISPATCH_WRITE_ROLES,
  },
  { icon: MapPin, label: "New customer", path: "/app/customers/create", roles: CUSTOMER_WRITE_ROLES },
  { icon: Users, label: "New driver", path: "/app/drivers/create", roles: FLEET_ROLES },
  { icon: Truck, label: "New vehicle", path: "/app/vehicles/create", roles: FLEET_ROLES },
  {
    icon: Cpu,
    label: "Register device",
    path: "/app/devices",
    roles: ADMIN_OPS_ROLES,
  },
];

export function CommandPalette({
  open,
  onOpenChange,
  nav,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Already role-filtered by the caller — the palette must not offer a link
  /// the sidebar itself wouldn't show.
  nav: NavItem[];
  role: MembershipRole | null;
}) {
  const navigate = useNavigate();
  const navPaths = new Set(nav.map((item) => item.path));

  const go = (path: string) => {
    onOpenChange(false);
    navigate({ to: path as any });
  };

  const actions = QUICK_ACTIONS.filter((action) => {
    if (!role || !action.roles.includes(role)) return false;
    const section = action.path.split("/").slice(0, 3).join("/");
    return navPaths.has(section);
  });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, or run a quick action..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          {actions.map((action) => (
            <CommandItem key={action.path} onSelect={() => go(action.path)}>
              <action.icon />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {nav.map((item) => (
            <CommandItem key={`${item.path}:${item.label}`} onSelect={() => go(item.path)}>
              <item.icon />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="hidden items-center justify-end gap-1 border-t border-border px-3 py-2 sm:flex">
        <span className="text-xs text-muted-foreground">Toggle with</span>
        <CommandShortcut>⌘K</CommandShortcut>
      </div>
    </CommandDialog>
  );
}
