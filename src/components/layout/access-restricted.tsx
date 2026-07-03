"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { roleHomePath, roleMeta, type Role } from "@/lib/role";

export function AccessRestricted({ role }: { role: Role }) {
  const meta = roleMeta[role];

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">
            The <span className="font-medium text-foreground">{meta.label}</span> demo role
            doesn&apos;t have access to this page. This is a UI permission preview, not a real
            security boundary.
          </p>
          <Button asChild className="mt-2">
            <Link href={roleHomePath[role]}>Go to my dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
