"use client";

import { useRouter } from "next/navigation";
import { LogOut, PlugZap, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDataMode } from "@/lib/data-mode";
import { useApiSession } from "@/lib/api-session";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin/Owner",
  OPERATIONS_MANAGER: "Operations Manager",
  DISPATCHER: "Dispatcher",
  ACCOUNTANT: "Accountant",
  DRIVER: "Driver",
  SALES_CRM_MANAGER: "Sales/CRM Manager",
};

/// Rendered in AppTopbar, entirely separate from the demo role
/// switcher/badge (which lives in AppSidebar's brand block) — this is a
/// no-op (returns null) whenever NEXT_PUBLIC_DATA_MODE isn't "api", so demo
/// mode's topbar is pixel-for-pixel unchanged.
export function ConnectedWorkspaceControl() {
  const router = useRouter();
  const { session, logout, logoutAll } = useApiSession();

  if (getDataMode() !== "api") return null;

  if (!session) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push("/auth/login")}
        className="gap-1.5"
      >
        <PlugZap className="size-3.5" />
        Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <span className="hidden sm:inline">{session.organization.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>
            {session.user.firstName} {session.user.lastName}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {session.organization.name} · {ROLE_LABELS[session.membership.role] ?? session.membership.role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings/organization")}>
          Organization settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings/members")}>Members</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            logout();
            router.push("/auth/login");
          }}
        >
          <LogOut className="size-3.5" />
          Log out
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            logoutAll();
            router.push("/auth/login");
          }}
        >
          <ShieldOff className="size-3.5" />
          Log out of all sessions
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
