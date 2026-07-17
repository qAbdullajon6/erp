import { createHash, randomBytes, timingSafeEqual } from "crypto";

/// Secret infrastructure for third-party API keys. Parallel to
/// invitations/invitation-token.util.ts rather than shared with it: these
/// secrets have a different shape (a displayable prefix is part of the
/// format), a different lifetime, and a different threat model, so folding
/// them into one helper would couple two things that only look alike.

/// Environment segment of the key format. `live` is the only value today;
/// the segment exists so a future sandbox/test key is distinguishable at a
/// glance by the developer reading it, without a lookup.
const KEY_ENVIRONMENT = "live";
const KEY_NAMESPACE = "flowerp";

/// Number of characters of the random body that also appear in the stored,
/// displayable prefix. Eight is enough for a human to tell two of their own
/// keys apart in a list, and far too few to brute-force the remaining
/// ~248 bits of the secret.
const PREFIX_BODY_CHARS = 8;

export interface GeneratedApiKey {
  /// The full secret. Returned to the caller exactly once, never stored.
  rawKey: string;
  /// The displayable, non-secret leading segment (stored).
  keyPrefix: string;
  /// SHA-256 hex digest of rawKey (stored).
  keyHash: string;
}

/// Mints a new key: 32 random bytes (256 bits) base64url-encoded, namespaced
/// so a leaked key is greppable and attributable to this product.
///
/// Format: `flowerp_live_<random>`
///
/// The returned rawKey is the only time the secret exists — persist keyHash
/// and keyPrefix, hand rawKey to the user, and let it fall out of scope.
export function generateApiKey(): GeneratedApiKey {
  const body = randomBytes(32).toString("base64url");
  const rawKey = `${KEY_NAMESPACE}_${KEY_ENVIRONMENT}_${body}`;

  return {
    rawKey,
    keyPrefix: `${KEY_NAMESPACE}_${KEY_ENVIRONMENT}_${body.slice(0, PREFIX_BODY_CHARS)}`,
    keyHash: hashApiKey(rawKey),
  };
}

/// SHA-256 hex digest — the same reasoning as hashRefreshToken and
/// hashInvitationToken: a fast equality lookup for an already-high-entropy
/// random secret, not a slow/salted password hash. Deterministic, so the
/// digest is directly indexable for the authentication lookup.
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/// Constant-time comparison of two key hashes, so a stored-vs-presented check
/// cannot be turned into a timing oracle. Returns false — rather than
/// throwing — for any malformed input, since none of those can ever match.
export function timingSafeKeyEquals(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  // Hash lengths are fixed and public (64 hex chars), so an early length
  // check leaks nothing. A zero-length value is never a real hash.
  if (bufferA.length === 0 || bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

/// Pulls the API key out of a request's headers, accepting either transport:
/// `Authorization: Bearer <key>` or `X-API-Key: <key>`. Returns null when
/// neither carries something shaped like one of our keys.
///
/// The namespace check on the Bearer branch is what lets API-key auth and
/// JWT auth share the Authorization header: a JWT never starts with
/// `flowerp_`, so this reliably declines to treat a session token as a key.
export function extractApiKey(headers: Record<string, unknown>): string | null {
  const apiKeyHeader = headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
    return apiKeyHeader.trim();
  }

  const authorization = headers["authorization"];
  if (typeof authorization === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match && match[1].startsWith(`${KEY_NAMESPACE}_`)) {
      return match[1].trim();
    }
  }

  return null;
}

/// Whether `expiresAt` has been reached. Null means the key never expires.
/// Expiry is inclusive: the exact expiry instant counts as expired — same
/// rule as isInvitationExpired.
export function isApiKeyExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}
