import { ApiError } from './error';

/** The ONE place a failure is turned into words a driver can act on. Mirrors
 * apps/web/src/lib/api/describe-error.ts's rule, extended with a case web doesn't
 * need: a request that hangs instead of failing outright (services/api/client.ts's
 * `fetchWithTimeout` turns that into a distinct TimeoutError rather than leaving
 * the caller to guess from a bare AbortError).
 *
 *   4xx      The server considered the request and refused it, in a sentence
 *            written for a human ("This dispatch has already been delivered").
 *            Shown verbatim.
 *   5xx      The server fell over. Replaced with a generic message.
 *   timeout  The request never got a response inside the timeout window — most
 *            often the API server itself is unreachable, not the phone's radio.
 *   none     The network blinked (or, on a phone, went out of range entirely) —
 *            `fetch` throws a bare TypeError. Replaced.
 */
export function describeError(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    if (error.status >= 400 && error.status < 500) {
      return error.message;
    }
    return 'The server had a problem handling that. Please try again in a moment.';
  }

  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'The server is taking too long to respond. It may be temporarily unavailable.';
  }

  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return error instanceof Error && error.message ? fallback : fallback;
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
