import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DriverAppShell } from "@/components/layout/driver-app-shell";
import { getNavForRole } from "@/components/layout/nav-config";
import { sessionManager, useLogout, useCurrentUser } from "@/lib/api/auth";
import { onSessionExpired } from "@/lib/api/session";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { useExitSupportMutation } from "@/lib/api/platform";
import type { MembershipRole } from "@/lib/api/organizations";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/list-states";
import { toast } from "sonner";
import { AlertTriangle, LifeBuoy, LogOut } from "lucide-react";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      // Only a fallback: each screen names itself. A shell-wide title of
      // "Command Center" made every tab claim to be the dashboard.
      { title: "FlowERP AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppRoute,
});

function SupportSessionBanner({
  organizationName,
  organizationStatus,
}: {
  organizationName: string;
  organizationStatus?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}) {
  const navigate = useNavigate();
  const { mutate: exitSupport, isPending } = useExitSupportMutation();
  const isSuspended = organizationStatus === "SUSPENDED";

  const handleExit = () => {
    exitSupport(undefined, {
      onSuccess: () => {
        toast.success("Exited support session");
        navigate({ to: "/platform", replace: true });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to exit support"),
    });
  };

  return (
    <div
      className={
        isSuspended
          ? "border-b border-destructive/40 bg-destructive/10 px-4 py-2.5 sm:px-6 lg:px-8"
          : "border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 sm:px-6 lg:px-8"
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div
          className={
            isSuspended
              ? "min-w-0 space-y-1 text-sm text-destructive"
              : "flex min-w-0 flex-wrap items-center gap-2 text-sm text-amber-950 dark:text-amber-100"
          }
        >
          {isSuspended ? (
            <>
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Organization Suspended
              </div>
              <p className="pl-6 text-destructive/90">
                Supporting <span className="font-semibold">{organizationName}</span>. This
                organization is currently suspended. Users cannot sign in until it is restored.
              </p>
            </>
          ) : (
            <>
              <LifeBuoy className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Supporting: <span className="font-semibold">{organizationName}</span>
              </span>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExit}
          disabled={isPending}
          className="gap-1.5 shrink-0 self-end sm:self-auto"
        >
          <LogOut className="h-3.5 w-3.5" />
          {isPending ? "Exiting…" : "Exit to Console"}
        </Button>
      </div>
    </div>
  );
}

function AppRoute() {
  const navigate = useNavigate();
  const { logout } = useLogout();
  const { data: currentUser, loading: userLoading } = useCurrentUser();
  const ready = useSessionGuard({
    hasValidSession: () => sessionManager.hasValidSession(),
    onExpired: onSessionExpired,
    loginPath: "/login",
    preserveReturnPath: true,
  });

  const isPlatformAdmin = currentUser?.user.isPlatformAdmin === true;
  const supportSession = currentUser?.supportSession ?? null;

  // Platform staff may only use tenant ERP inside an audited Open ERP
  // support session. Typing /app in the URL without one must bounce home.
  // JWT org must match the active support target — never trust a mismatched URL/token pair.
  useEffect(() => {
    if (!ready || userLoading || !currentUser) return;
    if (isPlatformAdmin && !supportSession) {
      navigate({ to: "/platform", replace: true });
      return;
    }
    if (
      isPlatformAdmin &&
      supportSession &&
      currentUser.organization.id !== supportSession.organizationId
    ) {
      navigate({
        to: "/platform/organizations/$orgId",
        params: { orgId: supportSession.organizationId },
        replace: true,
      });
    }
  }, [ready, userLoading, currentUser, isPlatformAdmin, supportSession, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login", replace: true });
  };

  if (!ready) return null;

  if (userLoading || !currentUser) {
    return <LoadingState label="Loading…" />;
  }

  if (isPlatformAdmin && !supportSession) {
    return <LoadingState label="Redirecting to Platform Console…" />;
  }

  const role = (currentUser.membership.role ?? "") as MembershipRole;

  if (role === "DRIVER") {
    return (
      <DriverAppShell currentUser={currentUser} onSignOut={() => void handleLogout()}>
        <Outlet />
      </DriverAppShell>
    );
  }

  // Inside support mode, nav mirrors the tenant role on the support membership
  // — never surface platform-only chrome in the tenant shell.
  const nav = getNavForRole(role, false);

  return (
    <AppShell
      nav={nav}
      navReady
      currentUser={currentUser}
      onSignOut={handleLogout}
      banner={
        supportSession ? (
          <SupportSessionBanner
            organizationName={supportSession.organizationName}
            organizationStatus={
              supportSession.organizationStatus ?? currentUser.organization.status
            }
          />
        ) : null
      }
    >
      <Outlet />
    </AppShell>
  );
}
