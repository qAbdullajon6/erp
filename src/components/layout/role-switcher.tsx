"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleMeta, roleOrder, useRole, type Role } from "@/lib/role";

export function RoleSwitcher() {
  const { role, meta, setRole } = useRole();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="hidden gap-2 sm:flex">
          <Avatar className="size-5">
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
              {meta.initials}
            </AvatarFallback>
          </Avatar>
          {meta.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Demo mode — view as
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={role} onValueChange={(v) => setRole(v as Role)}>
          {roleOrder.map((r) => (
            <DropdownMenuRadioItem key={r} value={r} className="items-start gap-2 py-2">
              <Avatar className="size-7 mt-0.5">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {roleMeta[r].initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0">
                <span className="font-medium">{roleMeta[r].label}</span>
                <span className="text-xs text-muted-foreground">{roleMeta[r].personName}</span>
                <span className="text-xs text-muted-foreground">{roleMeta[r].description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
          Role switching previews UI permissions for this demo — it is not real
          authentication.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
