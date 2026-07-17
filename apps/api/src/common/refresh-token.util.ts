import { createHash, randomBytes } from "crypto";

/// The one opaque-refresh-token primitive shared by every session flavor in
/// this app that issues one (staff auth/token.util.ts predates this and keeps
/// its own copy to avoid touching unrelated code; the customer portal is
/// built against this shared version from day one).

/// A cryptographically secure, opaque refresh token: 48 random bytes (384
/// bits of entropy) encoded as base64url. Only its hash is ever persisted.
export function generateOpaqueRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

/// SHA-256 hex digest — a fast equality lookup for an already-high-entropy
/// random secret, not a slow/salted password hash (see the RefreshToken
/// model comment in schema.prisma).
export function hashOpaqueRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/// The moment a token issued now stops being valid, `expiresInDays` days
/// from `from`. `from` is injectable purely so tests are deterministic.
export function opaqueRefreshTokenExpiry(expiresInDays: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
}

/// Whether a stored refresh-token row still grants a session: not revoked,
/// and not past its expiry. The one check every refresh flow must apply
/// identically before honoring a presented token.
export function isRefreshTokenActive(
  record: { revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return !record.revokedAt && record.expiresAt.getTime() > now.getTime();
}
