"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useApiSession } from "@/lib/api-session";

/// A dedicated route for "log me out" as a navigable action (e.g. a bare
/// link), separate from the account-menu Logout button (components/layout/
/// connected-workspace-control.tsx) which calls the same store.logout()
/// directly without a page transition.
export default function LogoutPage() {
  const router = useRouter();
  const { logout } = useApiSession();

  React.useEffect(() => {
    logout();
    router.replace("/auth/login");
  }, [logout, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Signing out…
      </CardContent>
    </Card>
  );
}
