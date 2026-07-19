import { createHash, randomBytes, timingSafeEqual } from "crypto";

/// Ingest secrets for telematics devices.
///
/// Deliberately parallel to developer/api-keys/api-key.util.ts — same threat
/// model (a high-entropy random secret presented on every request), same
/// decision (fast, indexable SHA-256 digest, not a slow password hash),
/// same constant-time comparison. Kept separate rather than shared because a
/// device secret has its own namespace and lifetime; folding them together
/// would couple two things that only look alike, exactly the reasoning the
/// API-key util already records.
///
/// A device secret is verified on EVERY position POST, so a slow argon2-style
/// hash here would be a self-inflicted throttle on the ingest hot path.

const NAMESPACE = "flowtel";
const ENVIRONMENT = "live";
const PREFIX_BODY_CHARS = 8;

export interface GeneratedDeviceSecret {
  /// Full secret, returned exactly once at creation/rotation, never stored.
  rawSecret: string;
  /// Displayable non-secret leading segment (stored on the device row).
  prefix: string;
  /// SHA-256 hex digest of rawSecret (stored).
  hash: string;
}

export function generateDeviceSecret(): GeneratedDeviceSecret {
  const body = randomBytes(32).toString("base64url");
  const rawSecret = `${NAMESPACE}_${ENVIRONMENT}_${body}`;
  return {
    rawSecret,
    prefix: `${NAMESPACE}_${ENVIRONMENT}_${body.slice(0, PREFIX_BODY_CHARS)}`,
    hash: hashDeviceSecret(rawSecret),
  };
}

export function hashDeviceSecret(rawSecret: string): string {
  return createHash("sha256").update(rawSecret).digest("hex");
}

/// Constant-time hash comparison — no timing oracle on the ingest path.
export function timingSafeSecretEquals(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
