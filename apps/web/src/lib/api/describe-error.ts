import { ApiError } from './error';

/// The ONE place a failure is turned into words a dispatcher can act on.
///
/// The rule is not "never show what the server said" — it is "never show the user
/// something that is not about them". Those are different, and the difference is the
/// HTTP status:
///
///   4xx  The server considered the request and refused it, in a sentence written
///        for a human: "This driver is already assigned to dispatch DSP-000041
///        during the requested time range." That IS the operational reason, and
///        rewording it here would only make it vaguer. Shown verbatim.
///
///   5xx  The server fell over. Whatever it said is about the server, not about the
///        dispatcher, and is very likely a stack-shaped string. Replaced.
///
///   none The network blinked. `fetch` throws a bare TypeError whose message is
///        "Failed to fetch" — meaningless to anybody. Replaced.
///
/// Before Task 8.11 the dispatch screens could not tell these apart, because their
/// API clients threw a plain Error with no status. A 409 and a dropped Wi-Fi
/// connection arrived looking identical — and worse, they read `error.message` from
/// a body shaped `{ error: { message } }`, so the server's careful explanation was
/// silently discarded and the user was shown "Failed to update dispatch: Conflict".
export function describeError(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    // The server's own words, when the server was talking to the user.
    if (error.status >= 400 && error.status < 500) {
      return error.message;
    }
    return 'The server had a problem handling that. Please try again in a moment.';
  }

  // Not an ApiError at all: the request never got an answer.
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return error instanceof Error && error.message ? fallback : fallback;
}

/// True when the failure is a conflict — the operation was understood and refused
/// because of the state of the world (a double-booked driver, an illegal
/// transition). Callers use this to decide whether to keep a dialog open so the
/// user can pick something else, rather than closing it as if the work were done.
export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
