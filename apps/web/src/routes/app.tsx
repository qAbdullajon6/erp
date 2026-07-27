import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DriverAppShell } from "@/components/layout/driver-app-shell";
import { getNavForRole } from "@/components/layout/nav-config";
import { sessionManager, useLogout, useCurrentUser } from "@/lib/api/auth";
import { onSessionExpired } from "@/lib/api/session";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { useExitSupportMutation } from "@/lib/api/platform";
import type { MembershipRole } from "@/lib/api/organizations";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LifeBuoy, LogOut } from "lucide-react";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Command Center — FlowERP AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppRoute,
});

function SupportSessionBanner({
  organizationName,
}: {
  organizationName: string;
}) {
  const navigate = useNavigate();
  const { mutate: exitSupport, isPending } = useExitSupportMutation();

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
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 sm:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm text-amber-950 dark:text-amber-100">
        <LifeBuoy className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Support: <span className="font-semibold">{organizationName}</span>
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={handleExit} disabled={isPending} className="gap-1.5 shrink-0">
        <LogOut className="h-3.5 w-3.5" />
        {isPending ? "Exiting…" : "Exit"}
      </Button>
    </div>
  );
}

function AppRoute() {
  const navigate = useNavigate();
  const { logout } = useLogout();
  const { data: currentUser } = useCurrentUser();
  const ready = useSessionGuard({
    hasValidSession: () => sessionManager.hasValidSession(),
    onExpired: onSessionExpired,
    loginPath: "/auth/sign-in",
  });

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/auth/sign-in", replace: true });
  };

  if (!ready) return null;

  const role = (currentUser?.membership.role ?? "") as MembershipRole;
  const isPlatformAdmin = currentUser?.user.isPlatformAdmin === true;
  const supportSession = currentUser?.supportSession ?? null;

  if (role === "DRIVER") {
    return (
      <DriverAppShell currentUser={currentUser ?? null} onSignOut={() => void handleLogout()}>
        <Outlet />
      </DriverAppShell>
    );
  }

  const nav = getNavForRole(role, isPlatformAdmin);

  return (
    <AppShell
      nav={nav}
      navReady={!!currentUser}
      currentUser={currentUser ?? null}
      onSignOut={handleLogout}
      banner={
        supportSession ? (
          <SupportSessionBanner organizationName={supportSession.organizationName} />
        ) : null
      }
    >
      <Outlet />
    </AppShell>
  );
}
