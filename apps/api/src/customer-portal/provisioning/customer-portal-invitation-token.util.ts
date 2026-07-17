import { createHash, randomBytes } from "crypto";

/// Secure token infrastructure for customer-portal invitations. Mirrors
/// invitations/invitation-token.util.ts exactly (same entropy, same hash
/// algorithm) but is kept as its own file rather than shared, matching that
/// file's own stated reasoning: these serve a different secret/purpose than
/// the staff-invitation token, so parallel-by-design beats a shared function
/// that would couple the two domains together.

/// A cryptographically secure, opaque invitation token: 32 random bytes
/// (256 bits of entropy) encoded as base64url. Only its hash is ever stored;
/// the raw value lives only in the emailed activation link.
export function generateCustomerPortalInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/// SHA-256 hex digest — the same style as hashInvitationToken: a fast
/// equality lookup for an already-high-entropy random secret, not a slow/
/// salted password hash. Deterministic: the same token always hashes
/// identically.
export function hashCustomerPortalInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/// The moment an invitation created now stops being valid, `expiresInDays`
/// days from `from`. `from` is injectable purely so tests are deterministic.
export function calculateCustomerPortalInvitationExpiry(
  expiresInDays: number,
  from: Date = new Date(),
): Date {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + expiresInDays * millisecondsPerDay);
}

/// Whether `expiresAt` has been reached. Expiry is inclusive: the exact
/// expiry instant counts as expired.
export function isCustomerPortalInvitationExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/// Whether a value has the exact shape of a minted token: 32 random bytes as
/// base64url, i.e. 43 characters from the URL-safe alphabet, no padding.
/// Anything else cannot match a stored hash, so it is rejected before any DB
/// work — a format gate, not a secret comparison.
export function isWellFormedCustomerPortalInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
