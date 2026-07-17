import { OutputFilter, StreamOutputFilter } from "./output-filter";

describe("OutputFilter", () => {
  let filter: OutputFilter;

  beforeEach(() => {
    filter = new OutputFilter();
  });

  describe("filter()", () => {
    it("passes normal text through unchanged", () => {
      const text = "Your organization has 14 active orders and 3 overdue invoices.";
      const result = filter.filter(text);
      expect(result.text).toBe(text);
      expect(result.filtered).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it("redacts Anthropic API keys", () => {
      const text = "The key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890 stored here.";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.text).not.toContain("sk-ant-api03");
      expect(result.text).toContain("[redacted]");
      expect(result.reasons).toContain("anthropic_key");
    });

    it("redacts OpenAI API keys", () => {
      const text = "Found sk-projAbcdefghij12345678901234567890 in config.";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.text).toContain("[redacted]");
      expect(result.reasons).toContain("openai_key");
    });

    it("redacts Bearer tokens", () => {
      const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.text).toContain("[redacted]");
    });

    it("redacts database URLs", () => {
      const text = "DATABASE_URL=postgresql://user:password@localhost:5432/erp";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.text).toContain("[redacted]");
      expect(result.reasons).toContain("database_url");
    });

    it("redacts FlowERP API keys", () => {
      const text = "Your key: flowerp_live_abc123defXYZ-test_key";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.text).toContain("[redacted]");
      expect(result.reasons).toContain("flowerp_api_key");
    });

    it("redacts webhook secrets", () => {
      const text = "Webhook signing secret: whsec_tR93sYKFbWgjGOjf28D4";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.reasons).toContain("webhook_secret");
    });

    it("redacts password hashes", () => {
      const text = "Hash: $argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$output";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.reasons).toContain("password_hash");
    });

    it("redacts multiple secrets in one text", () => {
      const text =
        "Keys: sk-ant-abcdefghijklmnopqrstuvwx and flowerp_live_xyz98765test are exposed.";
      const result = filter.filter(text);
      expect(result.filtered).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it("does not false-positive on normal text with 'sk' or 'Bearer'", () => {
      const text = "The dispatcher asked about skipping the route. The bearer of news arrived.";
      const result = filter.filter(text);
      expect(result.filtered).toBe(false);
    });

    it("returns empty result for empty string", () => {
      const result = filter.filter("");
      expect(result.text).toBe("");
      expect(result.filtered).toBe(false);
    });
  });
});

describe("StreamOutputFilter", () => {
  let base: OutputFilter;

  beforeEach(() => {
    base = new OutputFilter();
  });

  it("catches a secret split across two chunks", () => {
    const stream = base.createStreamFilter();
    const chunk1 = "Here is the key: sk-ant-";
    const chunk2 = "abcdefghijklmnopqrstuvwxyz1234567890. Done.";

    const result1 = stream.push(chunk1);
    const result2 = stream.push(chunk2);
    const final = stream.flush();

    const combined = result1 + result2 + final;
    expect(combined).not.toContain("sk-ant-");
    expect(combined).toContain("[redacted]");
    expect(stream.filtered).toBe(true);
  });

  it("flushes normal text completely", () => {
    const stream = base.createStreamFilter();
    const result1 = stream.push("Hello, your orders are: ");
    const result2 = stream.push("3 delivered, 1 pending.");
    const final = stream.flush();

    const combined = result1 + result2 + final;
    expect(combined).toContain("Hello, your orders are:");
    expect(combined).toContain("3 delivered, 1 pending.");
    expect(stream.filtered).toBe(false);
  });

  it("holds back CARRY_CHARS tail until more data arrives or flush", () => {
    const stream = base.createStreamFilter();
    const short = "hi";
    const result = stream.push(short);
    // Short chunk is held entirely in carry
    expect(result).toBe("");
    const final = stream.flush();
    expect(final).toBe("hi");
  });
});
