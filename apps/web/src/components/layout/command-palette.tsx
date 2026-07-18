import { useNavigate } from "@tanstack/react-router";
import { Package, Route as RouteIcon, MapPin, Truck, Users } from "lucide-react";
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

type QuickAction = {
  icon: typeof Package;
  label: string;
  path: string;
  /// Same role gate as the underlying create route/controller — an action a
  /// role can't use shouldn't be offered, for the same reason nav-config
  /// hides links the API would 403 on.
  roles?: NavItem["roles"];
};

const QUICK_ACTIONS: QuickAction[] = [
  { icon: Package, label: "New order", path: "/app/orders/create" },
  {
    icon: RouteIcon,
    label: "New dispatch",
    path: "/app/dispatches/create",
    roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"],
  },
  { icon: MapPin, label: "New customer", path: "/app/customers/create" },
  { icon: Users, label: "New driver", path: "/app/drivers/create", roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"] },
  { icon: Truck, label: "New vehicle", path: "/app/vehicles/create", roles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"] },
];

export function CommandPalette({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Already role-filtered by the caller — the palette must not offer a link
  /// the sidebar itself wouldn't show.
  nav: NavItem[];
}) {
  const navigate = useNavigate();
  const navPaths = new Set(nav.map((item) => item.path));

  const go = (path: string) => {
    onOpenChange(false);
    navigate({ to: path as any });
  };

  const actions = QUICK_ACTIONS.filter((action) => {
    if (!action.roles) return true;
    // A quick action's create-path always belongs to the same section as one
    // of the nav entries, so gate it on that entry being visible.
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
            <CommandItem key={item.path} onSelect={() => go(item.path)}>
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
