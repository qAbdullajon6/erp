import { createHmac } from "crypto";
import {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./webhook-signature.util";

describe("generateWebhookSecret", () => {
  it("returns a namespaced secret", () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_/);
  });

  it("never repeats across many mints", () => {
    const secrets = new Set(Array.from({ length: 500 }, () => generateWebhookSecret()));
    expect(secrets.size).toBe(500);
  });
});

describe("signWebhookPayload", () => {
  const secret = "whsec_test-secret";
  const body = JSON.stringify({ event: "order.created", data: { id: "abc" } });

  it("produces a t=<ts>,v1=<hex> header", () => {
    const header = signWebhookPayload(secret, body, 1_700_000_000);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
  });

  it("signs over `<timestamp>.<body>`, not the body alone", () => {
    // Binding the timestamp is what bounds replay: a captured delivery cannot
    // stay valid forever. This asserts the exact signed material so the scheme
    // cannot be loosened to body-only without failing here.
    const timestamp = 1_700_000_000;
    const header = signWebhookPayload(secret, body, timestamp);
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(header).toBe(`t=${timestamp},v1=${expected}`);
    expect(header).not.toContain(createHmac("sha256", secret).update(body).digest("hex"));
  });

  it("yields a different signature for a different timestamp", () => {
    expect(signWebhookPayload(secret, body, 1_700_000_000)).not.toBe(
      signWebhookPayload(secret, body, 1_700_000_001),
    );
  });

  it("yields a different signature for a different body", () => {
    const ts = 1_700_000_000;
    expect(signWebhookPayload(secret, body, ts)).not.toBe(signWebhookPayload(secret, "{}", ts));
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test-secret";
  const body = JSON.stringify({ event: "order.created" });
  const now = 1_700_000_000;

  it("accepts a signature it just produced", () => {
    const header = signWebhookPayload(secret, body, now);
    expect(verifyWebhookSignature(secret, body, header, 300, now)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const header = signWebhookPayload("whsec_other-secret", body, now);
    expect(verifyWebhookSignature(secret, body, header, 300, now)).toBe(false);
  });

  it("rejects when the body was tampered with after signing", () => {
    const header = signWebhookPayload(secret, body, now);
    expect(verifyWebhookSignature(secret, '{"event":"order.deleted"}', header, 300, now)).toBe(false);
  });

  it("rejects a signature older than the tolerance (replay)", () => {
    const header = signWebhookPayload(secret, body, now - 301);
    expect(verifyWebhookSignature(secret, body, header, 300, now)).toBe(false);
  });

  it("accepts a signature within the tolerance", () => {
    const header = signWebhookPayload(secret, body, now - 299);
    expect(verifyWebhookSignature(secret, body, header, 300, now)).toBe(true);
  });

  it("rejects a future timestamp beyond the tolerance", () => {
    // Symmetric: a clock-skewed or forged future timestamp must not extend
    // a signature's life.
    const header = signWebhookPayload(secret, body, now + 301);
    expect(verifyWebhookSignature(secret, body, header, 300, now)).toBe(false);
  });

  it("rejects malformed headers rather than throwing", () => {
    for (const header of ["", "garbage", "t=abc,v1=def", "v1=onlysig", "t=1700000000", "t=1700000000,v2=x"]) {
      expect(verifyWebhookSignature(secret, body, header, 300, now)).toBe(false);
    }
  });

  it("rejects a truncated signature of the right prefix", () => {
    const header = signWebhookPayload(secret, body, now);
    const truncated = header.slice(0, header.length - 2);
    expect(verifyWebhookSignature(secret, body, truncated, 300, now)).toBe(false);
  });
});
