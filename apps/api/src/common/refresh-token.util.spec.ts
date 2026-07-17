import {
  generateOpaqueRefreshToken,
  hashOpaqueRefreshToken,
  isRefreshTokenActive,
  opaqueRefreshTokenExpiry,
} from "./refresh-token.util";

describe("refresh-token.util", () => {
  it("generates a high-entropy base64url token", () => {
    const a = generateOpaqueRefreshToken();
    const b = generateOpaqueRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically", () => {
    const token = generateOpaqueRefreshToken();
    expect(hashOpaqueRefreshToken(token)).toBe(hashOpaqueRefreshToken(token));
  });

  it("hashes different tokens differently", () => {
    expect(hashOpaqueRefreshToken("a")).not.toBe(hashOpaqueRefreshToken("b"));
  });

  it("computes expiry N days from a given instant", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const expiry = opaqueRefreshTokenExpiry(30, from);
    expect(expiry.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  describe("isRefreshTokenActive", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");

    it("is active when not revoked and not expired", () => {
      expect(
        isRefreshTokenActive({ revokedAt: null, expiresAt: new Date("2026-02-01T00:00:00.000Z") }, now),
      ).toBe(true);
    });

    it("is inactive once revoked", () => {
      expect(
        isRefreshTokenActive(
          { revokedAt: new Date("2026-01-10T00:00:00.000Z"), expiresAt: new Date("2026-02-01T00:00:00.000Z") },
          now,
        ),
      ).toBe(false);
    });

    it("is inactive once expired", () => {
      expect(
        isRefreshTokenActive({ revokedAt: null, expiresAt: new Date("2026-01-01T00:00:00.000Z") }, now),
      ).toBe(false);
    });

    it("treats the exact expiry instant as expired", () => {
      expect(isRefreshTokenActive({ revokedAt: null, expiresAt: now }, now)).toBe(false);
    });
  });
});
