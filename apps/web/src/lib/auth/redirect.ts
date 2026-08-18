/// Whether a `?redirect=` value is safe to navigate to after signing in.
///
/// The session guard puts the page you were trying to reach into the URL, and
/// that URL is attacker-controllable: a link to
/// `/login?redirect=https://evil.example/harvest` would otherwise turn our own
/// sign-in page into a credible-looking redirector to a phishing form. Only
/// same-origin application paths are accepted.
///
/// `//evil.example` and `/\evil.example` are the cases worth spelling out:
/// browsers read both as protocol-relative URLs pointing at another host, even
/// though they start with a slash.
export function isSafeRedirect(value: string | undefined | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return true;
}
