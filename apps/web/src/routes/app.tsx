import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { getNavForRole } from "@/components/layout/nav-config";
import { sessionManager, useLogout, useCurrentUser } from "@/lib/api/auth";
import { onSessionExpired } from "@/lib/api/session";
import { useSessionGuard } from "@/hooks/use-session-guard";
import type { MembershipRole } from "@/lib/api/organizations";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Command Center — FlowERP AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppRoute,
});

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
  const nav = getNavForRole(role, isPlatformAdmin);

  return (
    <AppShell nav={nav} navReady={!!currentUser} currentUser={currentUser ?? null} onSignOut={handleLogout}>
      <Outlet />
    </AppShell>
  );
}
