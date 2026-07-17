import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/// Outbound webhook signing. Unlike every other secret in this codebase, a
/// webhook secret is stored in recoverable form: it is an HMAC key, so the
/// server must be able to re-derive the same signature the receiver checks.
/// Hashing it would make signing impossible. That is why WebhookEndpoint.secret
/// holds the raw value while ApiKey holds only a digest — the asymmetry is
/// forced by what the secret is for, not an oversight.

const SIGNATURE_VERSION = "v1";

/// A 32-byte (256-bit) HMAC key, base64url-encoded, namespaced so a leaked
/// secret is greppable and attributable.
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/// Builds the signature header value for a payload.
///
/// The timestamp is inside the signed material, not merely alongside it —
/// signing only the body would let an attacker who captured one delivery
/// replay it verbatim forever, since the signature would stay valid. Binding
/// the timestamp lets a receiver reject anything outside its tolerance.
///
/// Format: `t=<unix-seconds>,v1=<hex-hmac>`, over `<t>.<body>`.
export function signWebhookPayload(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const signature = computeSignature(secret, body, timestamp);
  return `t=${timestamp},${SIGNATURE_VERSION}=${signature}`;
}

function computeSignature(secret: string, body: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/// Verifies a signature header against a payload. Provided so this codebase's
/// own tests (and any receiver written against it) check signatures the same
/// way a correct integrator would, rather than each re-deriving the scheme.
///
/// `toleranceSeconds` bounds the replay window: a delivery signed longer ago
/// than this is rejected even if the HMAC is intact.
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  toleranceSeconds = 300,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  if (Math.abs(now - parsed.timestamp) > toleranceSeconds) return false;

  const expected = computeSignature(secret, body, parsed.timestamp);
  return timingSafeHexEquals(expected, parsed.signature);
}

function parseSignatureHeader(
  header: string,
): { timestamp: number; signature: string } | null {
  if (typeof header !== "string") return null;

  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || value === undefined) continue;
    if (key.trim() === "t") {
      const parsedTimestamp = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsedTimestamp)) timestamp = parsedTimestamp;
    } else if (key.trim() === SIGNATURE_VERSION) {
      signature = value.trim();
    }
  }

  if (timestamp === null || signature === null) return null;
  return { timestamp, signature };
}

/// Constant-time comparison, so signature checking cannot be turned into a
/// timing oracle that lets an attacker discover a valid signature byte by
/// byte. Mirrors timingSafeKeyEquals; kept separate because this compares
/// hex digests of a different width and must not borrow that one's
/// key-shaped assumptions.
function timingSafeHexEquals(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length === 0 || bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}
