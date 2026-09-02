import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "./token.util";

describe("password reset token utilities", () => {
  it("generates high-entropy opaque tokens and stable non-plaintext hashes", () => {
    const first = generatePasswordResetToken();
    const second = generatePasswordResetToken();

    expect(first).toHaveLength(43);
    expect(second).not.toBe(first);
    expect(hashPasswordResetToken(first)).toHaveLength(64);
    expect(hashPasswordResetToken(first)).toBe(hashPasswordResetToken(first));
    expect(hashPasswordResetToken(first)).not.toContain(first);
  });
});
