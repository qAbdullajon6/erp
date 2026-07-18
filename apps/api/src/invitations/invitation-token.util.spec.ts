import {
  calculateInvitationExpiry,
  generateInvitationToken,
  hashInvitationToken,
  isInvitationExpired,
  timingSafeTokenEquals,
} from "./invitation-token.util";

describe("generateInvitationToken", () => {
  it("produces a base64url string of 32 bytes (256 bits of entropy)", () => {
    const token = generateInvitationToken();

    // base64url alphabet only: A-Z a-z 0-9 - _ , and never '+', '/', or '='.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes encode to 43 base64url characters (no padding).
    expect(token).toHaveLength(43);
    // Decoding round-trips to exactly 32 bytes.
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("produces a unique value across 1000 generations (tokens and their hashes)", () => {
    const tokens = new Set<string>();
    const hashes = new Set<string>();

    for (let i = 0; i < 1000; i += 1) {
      const token = generateInvitationToken();
      tokens.add(token);
      hashes.add(hashInvitationToken(token));
    }

    expect(tokens.size).toBe(1000);
    expect(hashes.size).toBe(1000);
  });
});

describe("hashInvitationToken", () => {
  it("is deterministic: the same token always hashes identically", () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it("returns a 64-character SHA-256 hex digest", () => {
    const hash = hashInvitationToken(generateInvitationToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    const a = hashInvitationToken(generateInvitationToken());
    const b = hashInvitationToken(generateInvitationToken());
    expect(a).not.toBe(b);
  });

  it("hashes unicode input deterministically without throwing", () => {
    const unicodeToken = "invitación-🎫-Ω-你好";
    const first = hashInvitationToken(unicodeToken);
    const second = hashInvitationToken(unicodeToken);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("timingSafeTokenEquals", () => {
  it("returns true for identical hashes", () => {
    const hash = hashInvitationToken(generateInvitationToken());
    expect(timingSafeTokenEquals(hash, hash)).toBe(true);
  });

  it("returns false for different equal-length hashes", () => {
    const a = hashInvitationToken(generateInvitationToken());
    const b = hashInvitationToken(generateInvitationToken());
    expect(timingSafeTokenEquals(a, b)).toBe(false);
  });

  it("returns false for differing-length inputs instead of throwing", () => {
    const hash = hashInvitationToken(generateInvitationToken());
    expect(timingSafeTokenEquals(hash, hash.slice(0, -1))).toBe(false);
    expect(timingSafeTokenEquals(hash, `${hash}0`)).toBe(false);
  });

  it("returns false for zero-length input", () => {
    expect(timingSafeTokenEquals("", "")).toBe(false);
    const hash = hashInvitationToken(generateInvitationToken());
    expect(timingSafeTokenEquals("", hash)).toBe(false);
    expect(timingSafeTokenEquals(hash, "")).toBe(false);
  });

  it("returns false for malformed (non-string) input without throwing", () => {
    const hash = hashInvitationToken(generateInvitationToken());
    expect(timingSafeTokenEquals(null as unknown as string, hash)).toBe(false);
    expect(timingSafeTokenEquals(hash, undefined as unknown as string)).toBe(false);
    expect(timingSafeTokenEquals(123 as unknown as string, hash)).toBe(false);
    expect(timingSafeTokenEquals({} as unknown as string, hash)).toBe(false);
  });

  it("is unicode-safe: mismatched byte lengths compare false, identical strings compare true", () => {
    // A unicode string and an ASCII hash differ in byte length -> false, no throw.
    const hash = hashInvitationToken(generateInvitationToken());
    expect(timingSafeTokenEquals("🎫", hash)).toBe(false);
    // Two identical unicode strings are equal length -> true.
    expect(timingSafeTokenEquals("invitación-🎫", "invitación-🎫")).toBe(true);
    // Differing unicode of equal byte length -> false.
    expect(timingSafeTokenEquals("🎫", "🎟")).toBe(false);
  });
});

describe("calculateInvitationExpiry", () => {
  it("returns a Date `expiresInDays` after the given start", () => {
    const from = new Date("2026-07-10T00:00:00.000Z");
    const expiry = calculateInvitationExpiry(7, from);
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.toISOString()).toBe("2026-07-17T00:00:00.000Z");
  });

  it("does not mutate the provided start date", () => {
    const from = new Date("2026-07-10T00:00:00.000Z");
    calculateInvitationExpiry(7, from);
    expect(from.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("defaults the start to now when omitted", () => {
    const before = Date.now();
    const expiry = calculateInvitationExpiry(1);
    const after = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + oneDay);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + oneDay);
  });
});

describe("isInvitationExpired", () => {
  it("returns true when the expiry is in the past", () => {
    const now = new Date("2026-07-17T00:00:00.000Z");
    const expiresAt = new Date("2026-07-16T23:59:59.000Z");
    expect(isInvitationExpired(expiresAt, now)).toBe(true);
  });

  it("returns false when the expiry is in the future", () => {
    const now = new Date("2026-07-17T00:00:00.000Z");
    const expiresAt = new Date("2026-07-17T00:00:01.000Z");
    expect(isInvitationExpired(expiresAt, now)).toBe(false);
  });

  it("treats the exact expiry instant as expired (inclusive)", () => {
    const instant = new Date("2026-07-17T00:00:00.000Z");
    expect(isInvitationExpired(instant, new Date(instant.getTime()))).toBe(true);
  });

  it("agrees with calculateInvitationExpiry for a fresh invitation", () => {
    const from = new Date("2026-07-10T00:00:00.000Z");
    const expiry = calculateInvitationExpiry(7, from);
    // One day before expiry: not expired. One day after: expired.
    expect(isInvitationExpired(expiry, new Date("2026-07-16T00:00:00.000Z"))).toBe(false);
    expect(isInvitationExpired(expiry, new Date("2026-07-18T00:00:00.000Z"))).toBe(true);
  });
});
