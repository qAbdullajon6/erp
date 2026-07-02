"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleMeta, useRole, type Role } from "@/lib/role";

const roleOrder: Role[] = ["admin", "dispatcher", "accountant"];

export function RoleSwitcher() {
  const { role, meta, setRole } = useRole();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden gap-1.5 sm:flex">
          <ShieldCheck className="size-3.5" />
          {meta.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>View as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role)}>
          {roleOrder.map((r) => (
            <DropdownMenuRadioItem key={r} value={r} className="flex-col items-start gap-0">
              <span className="font-medium">{roleMeta[r].label}</span>
              <span className="text-xs text-muted-foreground">{roleMeta[r].description}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
