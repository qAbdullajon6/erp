import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/lib/api/auth";
import type { MembershipRole } from "@/lib/api/organizations";

function CenteredNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-3 py-8 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

const ROLE_LABELS: Record<MembershipRole, string> = {
  ADMIN: "Admin/Owner",
  OPERATIONS_MANAGER: "Operations Manager",
  DISPATCHER: "Dispatcher",
  ACCOUNTANT: "Accountant",
  DRIVER: "Driver",
  SALES_CRM_MANAGER: "Sales/CRM Manager",
};

function AccessRestrictedNotice({ role }: { role: MembershipRole | "" }) {
  return (
    <CenteredNotice>
      <ShieldAlert className="mx-auto size-6 text-destructive" />
      <p className="text-sm font-medium">You don&apos;t have access to this page</p>
      <p className="text-sm text-muted-foreground">
        This area isn&apos;t available for your role
        {role ? (
          <>
            {" "}
            — you&apos;re signed in as <span className="font-medium">{ROLE_LABELS[role]}</span>.
          </>
        ) : (
          "."
        )}
      </p>
    </CenteredNotice>
  );
}

interface ProtectedApiRouteProps {
  children: React.ReactNode;
  /// Roles allowed to view this page — keep this in step with the backing
  /// controller's own read-role list (see app.tsx's NavItem cross-reference
  /// table, which every one of these values is copied from). Omit only for
  /// pages every non-DRIVER role may reach, matching that table's own
  /// convention for an unrestricted NavItem.
  requireRoles?: MembershipRole[];
  /// FlowERP staff only, regardless of membership role — the API enforces
  /// this with PlatformAdminGuard; this check is a courtesy that avoids a
  /// confusing render-then-403, not the actual access control.
  platformAdminOnly?: boolean;
}

/// Architecture review fix: this was reduced to a bare pass-through
/// (`return <>{children}</>`) during the Lovable/Vite migration, silently
/// dropping the session-redirect and role-gating the pre-migration
/// (Next.js) version had — every one of the 24 routes importing this
/// component looked protected but wasn't. AppShell (routes/app.tsx) already
/// blocks rendering any child route until a valid session is confirmed, so
/// the gap this reopens is specifically role-based: a role the sidebar
/// hides a link from (because the API would 403 it) could still navigate
/// directly to the URL and see the page attempt to render/fetch before
/// failing, rather than a clear "you don't have access" notice. Reimplemented
/// against this app's actual stack (useCurrentUser + plain conditional
/// render) rather than the old Next.js version's useRouter/usePathname.
export function ProtectedApiRoute({ children, requireRoles, platformAdminOnly }: ProtectedApiRouteProps) {
  const { data: currentUser, loading } = useCurrentUser();

  // AppShell already renders nothing until a session is confirmed and
  // useCurrentUser has resolved by the time any child route mounts under it
  // in practice — this loading guard just avoids a flash of the restricted
  // notice while the shared query is still in flight.
  if (loading || !currentUser) return null;

  const role = currentUser.membership.role as MembershipRole;
  const isPlatformAdmin = currentUser.user.isPlatformAdmin === true;

  if (platformAdminOnly && !isPlatformAdmin) {
    return <AccessRestrictedNotice role={role} />;
  }
  if (requireRoles && !requireRoles.includes(role)) {
    return <AccessRestrictedNotice role={role} />;
  }

  return <>{children}</>;
}
