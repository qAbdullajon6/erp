"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, PlugZap, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getDataMode } from "@/lib/data-mode";
import { useApiSession } from "@/lib/api-session";
import type { ApiMembershipRole } from "@/lib/api-client";

function CenteredNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-3 py-8 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

function ConnectedModeRequiredNotice() {
  return (
    <CenteredNotice>
      <PlugZap className="mx-auto size-6 text-muted-foreground" />
      <p className="text-sm font-medium">Configuration Error</p>
      <p className="text-sm text-muted-foreground">
        This feature requires API mode to be enabled. Please contact support if you see this message.
      </p>
    </CenteredNotice>
  );
}

function LoadingNotice() {
  return (
    <CenteredNotice>
      <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Checking your session…</p>
    </CenteredNotice>
  );
}

const ROLE_LABELS: Record<ApiMembershipRole, string> = {
  ADMIN: "Admin/Owner",
  OPERATIONS_MANAGER: "Operations Manager",
  DISPATCHER: "Dispatcher",
  ACCOUNTANT: "Accountant",
  DRIVER: "Driver",
  SALES_CRM_MANAGER: "Sales/CRM Manager",
};

function ApiAccessRestricted({ role }: { role: ApiMembershipRole }) {
  return (
    <CenteredNotice>
      <ShieldAlert className="mx-auto size-6 text-destructive" />
      <p className="text-sm font-medium">You don&apos;t have access to this page</p>
      <p className="text-sm text-muted-foreground">
        This area is restricted to organization admins. You are signed in as{" "}
        <span className="font-medium">{ROLE_LABELS[role]}</span>.
      </p>
    </CenteredNotice>
  );
}

interface ProtectedApiRouteProps {
  children: React.ReactNode;
  /// If given, only memberships with one of these roles may view the page —
  /// anyone else sees ApiAccessRestricted instead of the actual content.
  requireRole?: ApiMembershipRole[];
}

/// Route guard for Connected Mode-only pages (Customers' connected view,
/// /settings/*). In demo mode this is a no-op notice (the page simply
/// doesn't apply). In API mode: redirects unauthenticated visitors to
/// /auth/login?redirect=<here>, and once signed in, optionally restricts by
/// role. Never touches the demo role switcher or roleAllowedPaths in
/// src/lib/role.tsx — that system is untouched and orthogonal to this one.
export function ProtectedApiRoute({ children, requireRole }: ProtectedApiRouteProps) {
  const dataMode = getDataMode();
  const pathname = usePathname();
  const router = useRouter();
  const { session, initializing } = useApiSession();

  React.useEffect(() => {
    if (dataMode === "api" && !initializing && !session) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [dataMode, initializing, session, pathname, router]);

  if (dataMode !== "api") {
    return <ConnectedModeRequiredNotice />;
  }

  if (initializing || !session) {
    return <LoadingNotice />;
  }

  if (requireRole && !requireRole.includes(session.membership.role)) {
    return <ApiAccessRestricted role={session.membership.role} />;
  }

  return <>{children}</>;
}
