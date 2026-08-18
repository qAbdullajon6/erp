import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { PlatformShell } from '@/components/platform/platform-shell';
import { sessionManager, useLogout, useCurrentUser } from '@/lib/api/auth';
import { onSessionExpired } from '@/lib/api/session';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { LoadingState } from '@/components/shared/list-states';

export const Route = createFileRoute('/platform')({
  head: () => ({
    meta: [
      { title: 'Platform Console — FlowERP AI' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PlatformRoute,
});

function PlatformRoute() {
  const navigate = useNavigate();
  const { logout } = useLogout();
  const { data: currentUser, loading: userLoading } = useCurrentUser();
  const ready = useSessionGuard({
    hasValidSession: () => sessionManager.hasValidSession(),
    onExpired: onSessionExpired,
    loginPath: '/login',
  });

  const isPlatformAdmin = currentUser?.user.isPlatformAdmin === true;

  useEffect(() => {
    if (!userLoading && currentUser && !isPlatformAdmin) {
      navigate({ to: '/app', replace: true });
    }
  }, [userLoading, currentUser, isPlatformAdmin, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/login', replace: true });
  };

  if (!ready) return null;

  if (userLoading || !currentUser) {
    return <LoadingState label="Loading…" />;
  }

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <PlatformShell currentUser={currentUser} onSignOut={() => void handleLogout()}>
      <Outlet />
    </PlatformShell>
  );
}
