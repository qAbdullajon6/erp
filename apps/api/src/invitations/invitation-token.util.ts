import { createHash, randomBytes, timingSafeEqual } from "crypto";

/// Secure token infrastructure shared by every invitation endpoint (created
/// in later phases). Deliberately independent of auth/token.util.ts: the two
/// serve different secrets (refresh sessions vs. invitation links) and this
/// one uses a different byte length, so they are parallel by design rather
/// than a shared function. Nothing here logs, reads the environment, or holds
/// any state — the raw token exists only as a return value in local scope.

/// A cryptographically secure, opaque invitation token: 32 random bytes
/// (256 bits of entropy) encoded as base64url. Only its hash is ever stored;
/// the raw value lives only in the emailed accept link.
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/// SHA-256 hex digest — the same style as hashRefreshToken (see
/// auth/token.util.ts and the RefreshToken model comment): a fast equality
/// lookup for an already-high-entropy random secret, not a slow/salted
/// password hash. Deterministic: the same token always hashes identically.
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/// Constant-time comparison of two token hashes, so a stored-vs-presented hash
/// check cannot be turned into a timing oracle. Returns false — rather than
/// throwing — for any malformed input (non-strings, differing lengths, or
/// empty values), since none of those can ever be a legitimate match.
export function timingSafeTokenEquals(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  // timingSafeEqual requires equal lengths and throws otherwise. Hash lengths
  // are fixed and public (64 hex chars for SHA-256), so an early length check
  // leaks nothing sensitive. A zero-length comparison is treated as no match:
  // an empty value is never a real token hash.
  if (bufferA.length === 0 || bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

/// The moment an invitation created now stops being valid, `expiresInDays`
/// days from `from`. `from` is injectable purely so tests are deterministic;
/// callers pass `invitation.expiresInDays` from configuration.
export function calculateInvitationExpiry(expiresInDays: number, from: Date = new Date()): Date {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + expiresInDays * millisecondsPerDay);
}

/// Whether `expiresAt` has been reached. Date.getTime() is epoch milliseconds
/// in UTC, so this comparison is timezone-independent. Expiry is inclusive:
/// the exact expiry instant counts as expired.
export function isInvitationExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
