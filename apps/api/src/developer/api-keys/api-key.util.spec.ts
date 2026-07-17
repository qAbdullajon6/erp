import {
  extractApiKey,
  generateApiKey,
  hashApiKey,
  isApiKeyExpired,
  timingSafeKeyEquals,
} from "./api-key.util";

describe("generateApiKey", () => {
  it("returns a namespaced key whose prefix is a true prefix of the raw key", () => {
    const { rawKey, keyPrefix } = generateApiKey();

    expect(rawKey.startsWith("flowerp_live_")).toBe(true);
    // The prefix is displayed next to the key the user copied; if it were not
    // literally a prefix, an operator matching one to the other would be
    // comparing two unrelated strings.
    expect(rawKey.startsWith(keyPrefix)).toBe(true);
  });

  it("returns the hash of the raw key, not the raw key", () => {
    const { rawKey, keyHash } = generateApiKey();

    expect(keyHash).toBe(hashApiKey(rawKey));
    expect(keyHash).not.toContain(rawKey);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats a key across many mints", () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateApiKey().rawKey));
    expect(keys.size).toBe(500);
  });

  it("leaves the prefix too short to reconstruct the secret", () => {
    const { rawKey, keyPrefix } = generateApiKey();
    // The whole point of showing a prefix is that it is safe to show.
    expect(keyPrefix.length).toBeLessThan(rawKey.length / 2);
  });
});

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("flowerp_live_abc")).toBe(hashApiKey("flowerp_live_abc"));
  });

  it("differs for keys differing by one character", () => {
    expect(hashApiKey("flowerp_live_abc")).not.toBe(hashApiKey("flowerp_live_abd"));
  });
});

describe("timingSafeKeyEquals", () => {
  it("matches identical hashes", () => {
    const hash = hashApiKey("some-key");
    expect(timingSafeKeyEquals(hash, hash)).toBe(true);
  });

  it("rejects differing hashes", () => {
    expect(timingSafeKeyEquals(hashApiKey("a"), hashApiKey("b"))).toBe(false);
  });

  it("returns false rather than throwing on malformed input", () => {
    // timingSafeEqual throws on length mismatch; callers pass values straight
    // from a request, so this must degrade to "no match", never to a 500.
    expect(timingSafeKeyEquals("short", "muchlongervalue")).toBe(false);
    expect(timingSafeKeyEquals("", "")).toBe(false);
    expect(timingSafeKeyEquals(null as unknown as string, "x")).toBe(false);
    expect(timingSafeKeyEquals(undefined as unknown as string, undefined as unknown as string)).toBe(false);
  });
});

describe("extractApiKey", () => {
  it("reads the X-API-Key header", () => {
    expect(extractApiKey({ "x-api-key": "flowerp_live_abc" })).toBe("flowerp_live_abc");
  });

  it("reads a namespaced Authorization: Bearer value", () => {
    expect(extractApiKey({ authorization: "Bearer flowerp_live_abc" })).toBe("flowerp_live_abc");
  });

  it("accepts Bearer case-insensitively", () => {
    expect(extractApiKey({ authorization: "bearer flowerp_live_abc" })).toBe("flowerp_live_abc");
  });

  it("ignores a JWT in the Authorization header", () => {
    // This is what lets API-key auth and session auth share one header: a JWT
    // must fall through to JwtAuthGuard rather than be tried as a key.
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abc";
    expect(extractApiKey({ authorization: `Bearer ${jwt}` })).toBeNull();
  });

  it("prefers X-API-Key when both headers are present", () => {
    expect(
      extractApiKey({ "x-api-key": "flowerp_live_from-header", authorization: "Bearer flowerp_live_from-bearer" }),
    ).toBe("flowerp_live_from-header");
  });

  it("returns null when neither header carries a key", () => {
    expect(extractApiKey({})).toBeNull();
    expect(extractApiKey({ authorization: "Basic dXNlcjpwYXNz" })).toBeNull();
    expect(extractApiKey({ "x-api-key": "" })).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(extractApiKey({ "x-api-key": "  flowerp_live_abc  " })).toBe("flowerp_live_abc");
  });
});

describe("isApiKeyExpired", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("treats a null expiry as never expiring", () => {
    expect(isApiKeyExpired(null, now)).toBe(false);
  });

  it("is false before the expiry instant", () => {
    expect(isApiKeyExpired(new Date("2026-07-17T12:00:01.000Z"), now)).toBe(false);
  });

  it("is true after the expiry instant", () => {
    expect(isApiKeyExpired(new Date("2026-07-17T11:59:59.000Z"), now)).toBe(true);
  });

  it("treats the exact expiry instant as expired", () => {
    // Inclusive, matching isInvitationExpired — a key is never valid *at* the
    // moment it expires.
    expect(isApiKeyExpired(new Date("2026-07-17T12:00:00.000Z"), now)).toBe(true);
  });
});
