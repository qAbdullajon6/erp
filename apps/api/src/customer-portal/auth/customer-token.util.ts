import {
  generateOpaqueRefreshToken,
  hashOpaqueRefreshToken,
  opaqueRefreshTokenExpiry,
} from "../../common/refresh-token.util";

/// Thin, domain-named wrappers over the shared opaque-refresh-token
/// primitive (common/refresh-token.util.ts) — kept so call sites read
/// "customer refresh token" rather than the generic shared name, matching
/// the same convention driver-mobile's own token util would use.
export function generateCustomerRefreshToken(): string {
  return generateOpaqueRefreshToken();
}

export function hashCustomerRefreshToken(token: string): string {
  return hashOpaqueRefreshToken(token);
}

export function customerRefreshTokenExpiry(expiresInDays: number, from: Date = new Date()): Date {
  return opaqueRefreshTokenExpiry(expiresInDays, from);
}
