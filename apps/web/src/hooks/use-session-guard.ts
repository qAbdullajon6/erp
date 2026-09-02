import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';

interface SessionGuardOptions {
  hasValidSession: () => boolean;
  onExpired: (listener: () => void) => () => void;
  loginPath: string;
  /// Paths that must render without a session (login, invite activation).
  /// Defaults to `[loginPath]` when omitted.
  publicPaths?: string[];
  /// Send the page they were trying to reach to the login screen as
  /// `?redirect=`, so a shared deep link survives the detour. Opt-in because
  /// only a login screen that reads the parameter can honour it.
  preserveReturnPath?: boolean;
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
/// no reason, and the public-path check makes "redirect to login" a no-op
/// when already on an auth screen, which is the actual fix — belt and braces.
export function useSessionGuard({
  hasValidSession,
  onExpired,
  loginPath,
  publicPaths,
  preserveReturnPath = false,
}: SessionGuardOptions): boolean {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  const hasValidSessionRef = useRef(hasValidSession);
  hasValidSessionRef.current = hasValidSession;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const allowedPublic = publicPaths ?? [loginPath];
  const onPublicPath = allowedPublic.some((path) => location.pathname === path);

  /// Carry the page they were trying to reach. Without this, following a
  /// shared link to an order while signed out dropped you on the dashboard
  /// after signing in, with no clue what you had been sent to look at.
  ///
  /// `loginPath` is a plain string here because this hook serves several
  /// shells with different route trees, so the navigate options can't be
  /// narrowed to one route's search schema.
  const attempted = location.href;
  const bounce = useCallback(() => {
    navigate({
      to: loginPath,
      search: preserveReturnPath ? { redirect: attempted } : undefined,
      replace: true,
    } as never);
  }, [navigate, loginPath, preserveReturnPath, attempted]);

  useEffect(() => {
    if (onPublicPath) {
      setReady(true);
      return;
    }
    if (!hasValidSessionRef.current()) {
      bounce();
    } else {
      setReady(true);
    }
  }, [bounce, onPublicPath]);

  useEffect(() => {
    return onExpiredRef.current(() => {
      if (onPublicPath) return;
      bounce();
    });
  }, [bounce, onPublicPath]);

  return ready;
}
