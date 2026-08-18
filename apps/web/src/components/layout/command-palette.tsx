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

type Destination = {
  icon: typeof Package;
  label: string;
  path: string;
  /// Only set for entries that address a section within a screen.
  search?: Record<string, string>;
};

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
  // Secondary screens only appear in the sidebar while you are inside their
  // section, so the palette carries them everywhere — it is how you reach
  // Devices or Billing from the other side of the product.
  const destinations: Destination[] = nav.flatMap((item) => [
    { icon: item.icon, label: item.label, path: item.path },
    ...(item.children ?? []).map((child) => ({
      icon: item.icon,
      label: `${item.label} · ${child.label}`,
      path: child.path,
    })),
  ]);
  const navPaths = new Set(destinations.map((item) => item.path));

  /// Settings' own sections are not routes of their own, so nothing above lists
  /// them — and "where do I add a teammate" is a question the palette should be
  /// able to answer. Members is ADMIN-only, matching the section itself.
  const settings = nav.find((item) => item.path === "/app/settings");
  if (settings) {
    destinations.push(
      { icon: settings.icon, label: "Settings · Company identity", path: settings.path, search: { tab: "identity" } },
      ...(role === "ADMIN"
        ? [{ icon: settings.icon, label: "Settings · Members", path: settings.path, search: { tab: "members" } }]
        : []),
      { icon: settings.icon, label: "Settings · Your profile", path: settings.path, search: { tab: "profile" } },
    );
  }

  const go = (destination: Destination) => {
    onOpenChange(false);
    navigate({ to: destination.path as any, search: (destination.search ?? {}) as any });
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
            <CommandItem key={action.path} onSelect={() => go({ ...action })}>
              <action.icon />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {destinations.map((item) => (
            <CommandItem key={`${item.path}:${item.label}`} onSelect={() => go(item)}>
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
