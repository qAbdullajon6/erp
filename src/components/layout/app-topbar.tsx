"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { RoleSwitcher } from "@/components/layout/role-switcher";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/orders": "Orders",
  "/dispatch": "Dispatch Board",
  "/drivers": "Drivers & Vehicles",
  "/customers": "Customers / CRM",
  "/finance": "Finance",
  "/ai-assistant": "AI Assistant",
  "/reports": "Reports",
};

export function AppTopbar() {
  const pathname = usePathname();
  const title = titles[pathname] ?? "FlowERP AI";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-6">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>

      <div className="relative ml-4 hidden flex-1 max-w-md sm:block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search orders, customers, drivers..."
          className="pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <RoleSwitcher />
        <NotificationsPanel />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  OF
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">
                Oyatillo F.
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Company Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
