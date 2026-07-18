/// SSRF protection for customer-supplied webhook URLs.
///
/// A webhook URL is attacker-controlled by definition: the customer types it,
/// and the server then makes an authenticated outbound request to it from
/// inside the network perimeter. Without this, a webhook endpoint is a
/// general-purpose port scanner and a direct line to the cloud metadata
/// service.
///
/// Blocks by hostname literal only. That is a real, documented limitation:
/// a DNS name resolving to a private address still passes here, and closing
/// that hole properly requires resolving at request time and pinning the
/// socket to the checked address. Recorded in TECHNICAL_DEBT.md.

/// Link-local. NEVER allowed, in any environment, regardless of
/// allowPrivateTargets — 169.254.169.254 is the cloud metadata endpoint that
/// hands out instance credentials on every major provider, and no legitimate
/// webhook receiver has ever lived on a link-local address. Kept separate from
/// the list below precisely so the development escape hatch cannot reach it.
const ALWAYS_BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^169\.254\./,
  /^\[?fe80:/i,
  // AWS also exposes metadata over IPv6 at fd00:ec2::254.
  /^\[?fd00:ec2:/i,
];

/// Loopback and RFC1918 private ranges. Blocked by default; reachable only
/// when allowPrivateTargets is on, which is impossible in production (see
/// WebhookConfig). This is the set a developer legitimately needs open to
/// point a webhook at a receiver on their own machine or LAN.
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd[0-9a-f]{2}:/i,
];

export class WebhookUrlError extends Error {}

/// Throws WebhookUrlError when `url` is not a safe outbound target.
/// Callers translate that into whichever HTTP error suits their layer.
///
/// `allowPrivateTargets` comes from WebhookConfig, which forces it to false
/// in production — so passing true here can only ever happen in development
/// or tests, where pointing at a local receiver is the whole point.
export function assertSafeWebhookUrl(url: string, allowPrivateTargets = false): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebhookUrlError("Webhook URL is not a valid URL");
  }

  // Anything but HTTP(S) is a protocol confusion vector (file:, gopher:,
  // and friends), and none of them are a thing a webhook receiver speaks.
  // Never relaxed: allowPrivateTargets loosens *where* we may connect, not
  // *how*.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebhookUrlError("Webhook URL must use http or https");
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new WebhookUrlError("Webhook URL must include a host");
  }

  // Checked before the escape hatch: the cloud metadata endpoint is never a
  // legitimate target, so the development flag must not be able to open it.
  if (ALWAYS_BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new WebhookUrlError(
      "Webhook URL must not target a private, loopback, or link-local address",
    );
  }

  if (allowPrivateTargets) return;

  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new WebhookUrlError(
      "Webhook URL must not target a private, loopback, or link-local address",
    );
  }
}

/// Non-throwing form, for validating without a try/catch at the call site.
export function isSafeWebhookUrl(url: string, allowPrivateTargets = false): boolean {
  try {
    assertSafeWebhookUrl(url, allowPrivateTargets);
    return true;
  } catch {
    return false;
  }
}
