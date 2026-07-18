import {
  calculateCustomerPortalInvitationExpiry,
  generateCustomerPortalInvitationToken,
  hashCustomerPortalInvitationToken,
  isCustomerPortalInvitationExpired,
  isWellFormedCustomerPortalInvitationToken,
} from "./customer-portal-invitation-token.util";

describe("customer-portal-invitation-token.util", () => {
  it("generates a well-formed, unique token each call", () => {
    const a = generateCustomerPortalInvitationToken();
    const b = generateCustomerPortalInvitationToken();
    expect(a).not.toBe(b);
    expect(isWellFormedCustomerPortalInvitationToken(a)).toBe(true);
  });

  it("hashes deterministically", () => {
    const token = generateCustomerPortalInvitationToken();
    expect(hashCustomerPortalInvitationToken(token)).toBe(hashCustomerPortalInvitationToken(token));
  });

  it("computes expiry N days from a given instant", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(calculateCustomerPortalInvitationExpiry(7, from).toISOString()).toBe(
      "2026-01-08T00:00:00.000Z",
    );
  });

  describe("isCustomerPortalInvitationExpired", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");

    it("is false before expiry", () => {
      expect(isCustomerPortalInvitationExpired(new Date("2026-02-01T00:00:00.000Z"), now)).toBe(false);
    });

    it("is true after expiry", () => {
      expect(isCustomerPortalInvitationExpired(new Date("2026-01-01T00:00:00.000Z"), now)).toBe(true);
    });

    it("treats the exact expiry instant as expired", () => {
      expect(isCustomerPortalInvitationExpired(now, now)).toBe(true);
    });
  });

  describe("isWellFormedCustomerPortalInvitationToken", () => {
    it("accepts a real generated token", () => {
      expect(isWellFormedCustomerPortalInvitationToken(generateCustomerPortalInvitationToken())).toBe(
        true,
      );
    });

    it.each(["", "short", "not-base64!!!", "a".repeat(44), "a".repeat(42)])(
      "rejects malformed input %p",
      (value) => {
        expect(isWellFormedCustomerPortalInvitationToken(value)).toBe(false);
      },
    );
  });
});
