import { createHash, randomBytes } from "crypto";

/// A long random opaque string — never a JWT, never signed, never
/// meaningful on its own. Only its SHA-256 hash is ever persisted.
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

/// SHA-256, not a slow/salted hash: this is for fast equality lookup of an
/// already-high-entropy random secret, not for resisting a password
/// dictionary attack (see RefreshToken model comment in schema.prisma).
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
