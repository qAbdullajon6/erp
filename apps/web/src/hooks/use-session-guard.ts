import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';

interface SessionGuardOptions {
  hasValidSession: () => boolean;
  onExpired: (listener: () => void) => () => void;
  loginPath: string;
}

/// Architecture review fix: AppShell and PortalShell each re-implemented
/// this exact pair of effects — check the session on mount and redirect if
/// it's already gone, then keep watching for a session that dies mid-visit
/// (refresh token expired/revoked while the user sat on a screen) so every
/// subsequent request doesn't just 401 silently forever. See
/// lib/api/session.ts's onSessionExpired for the full rationale; a
/// deliberate sign-out already navigates explicitly and doesn't go through
/// this path.
///
/// Both callers pass `hasValidSession`/`onExpired` as fresh inline closures on
/// every render, and the shell that renders THIS guard also wraps its own
/// login route (nested under the same layout) — so without the two guards
/// below, visiting the login page itself renders the shell, finds no
/// session (correctly — you're not logged in yet), navigates to loginPath...
/// which is where you already are, re-rendering the shell, creating a new
/// closure, re-running the effect, and navigating again: an infinite loop
/// (reproduced as a real "Maximum update depth exceeded" crash on
/// /portal/login). Refs keep the effect from re-running on every render for
/// no reason, and the loginPath check makes "redirect to login" a no-op
/// when already there, which is the actual fix — belt and braces.
export function useSessionGuard({ hasValidSession, onExpired, loginPath }: SessionGuardOptions): boolean {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  const hasValidSessionRef = useRef(hasValidSession);
  hasValidSessionRef.current = hasValidSession;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const atLoginPath = location.pathname === loginPath;

  useEffect(() => {
    if (atLoginPath) {
      setReady(true);
      return;
    }
    if (!hasValidSessionRef.current()) {
      navigate({ to: loginPath as any, replace: true });
    } else {
      setReady(true);
    }
  }, [navigate, loginPath, atLoginPath]);

  useEffect(() => {
    return onExpiredRef.current(() => {
      if (atLoginPath) return;
      navigate({ to: loginPath as any, replace: true });
    });
  }, [navigate, loginPath, atLoginPath]);

  return ready;
}
