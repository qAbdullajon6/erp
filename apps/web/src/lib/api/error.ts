/// Carries the HTTP status alongside the message, so callers (and React
/// Query's retry policy) can tell "the server refused you" from "the network
/// blinked". A plain Error cannot.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/// A 4xx is the server's considered answer: retrying sends the same request to
/// get the same refusal. Only 5xx and transport failures are worth another go.
export function isClientError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/// Unwraps the API's `{ data }` envelope, or throws an ApiError carrying the
/// server's own message — the API wraps failures as `{ error: { message } }`.
export async function unwrapResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message ?? body?.message ?? fallback;
    throw new ApiError(Array.isArray(message) ? message[0] : message, response.status);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}
