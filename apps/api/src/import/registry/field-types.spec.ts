import { coerceValue, parseDate, type FieldDefinition } from "./field-types";

const field = (over: Partial<FieldDefinition> = {}): FieldDefinition => ({
  fieldName: "f",
  label: "Field",
  type: "string",
  required: false,
  aliases: [],
  ...over,
});

describe("coerceValue — blanks and requiredness", () => {
  it("rejects a blank required field", () => {
    const r = coerceValue("", field({ required: true, label: "Company Name" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Company Name is required");
  });

  it("treats whitespace-only as blank", () => {
    expect(coerceValue("   ", field({ required: true })).ok).toBe(false);
  });

  it("applies the default for a blank optional field", () => {
    expect(coerceValue("", field({ defaultValue: "NET_30" }))).toEqual({ ok: true, value: "NET_30" });
  });

  it("yields null for a blank optional field with no default", () => {
    expect(coerceValue("", field())).toEqual({ ok: true, value: null });
  });

  it("treats null and undefined as blank", () => {
    expect(coerceValue(null, field()).value).toBeNull();
    expect(coerceValue(undefined, field()).value).toBeNull();
  });
});

describe("coerceValue — email", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com"])("accepts %s", (v) => {
    expect(coerceValue(v, field({ type: "email" })).ok).toBe(true);
  });

  it.each(["notanemail", "a@b", "@b.co", "a b@c.co", "a@@b.co"])("rejects %s", (v) => {
    expect(coerceValue(v, field({ type: "email" })).ok).toBe(false);
  });

  it("lowercases, so two spellings of one address do not read as two people", () => {
    expect(coerceValue("Jane@Acme.COM", field({ type: "email" })).value).toBe("jane@acme.com");
  });
});

describe("coerceValue — phone", () => {
  it("strips the punctuation humans actually type", () => {
    expect(coerceValue("+1 (555) 010-9999", field({ type: "phone" })).value).toBe("+15550109999");
  });

  it.each(["123", "abcdefgh", "+1234567890123456789"])("rejects %s", (v) => {
    expect(coerceValue(v, field({ type: "phone" })).ok).toBe(false);
  });
});

describe("coerceValue — numbers", () => {
  it("rejects a non-numeric string", () => {
    expect(coerceValue("abc", field({ type: "decimal" })).error).toBe("Field must be a number");
  });

  it("rejects a negative when min is 0, and says so plainly", () => {
    const r = coerceValue("-5", field({ type: "decimal", min: 0, label: "Amount" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Amount cannot be negative");
  });

  it("accepts a European decimal comma", () => {
    // What Excel emits under a European locale — rejecting it would fail a file
    // that is not actually wrong.
    expect(coerceValue("1234,56", field({ type: "decimal" })).value).toBe(1234.56);
  });

  it("strips thousands separators", () => {
    expect(coerceValue("1,234,567.89", field({ type: "decimal" })).value).toBe(1234567.89);
  });

  it("requires a whole number for integer", () => {
    expect(coerceValue("12.5", field({ type: "integer" })).ok).toBe(false);
    expect(coerceValue("12", field({ type: "integer" })).value).toBe(12);
  });

  it("enforces integer bounds", () => {
    const year = field({ type: "integer", min: 1900, max: 2100, label: "Year" });
    expect(coerceValue("1899", year).ok).toBe(false);
    expect(coerceValue("2101", year).ok).toBe(false);
    expect(coerceValue("2021", year).value).toBe(2021);
  });
});

describe("coerceValue — enum", () => {
  const status = field({ type: "enum", enumValues: ["ACTIVE", "ON_LEAVE"], label: "Status" });

  it("accepts an exact value", () => {
    expect(coerceValue("ACTIVE", status).value).toBe("ACTIVE");
  });

  it("normalises case and separators", () => {
    // "on leave" and "on-leave" are what a human types for ON_LEAVE.
    expect(coerceValue("on leave", status).value).toBe("ON_LEAVE");
    expect(coerceValue("On-Leave", status).value).toBe("ON_LEAVE");
  });

  it("rejects an unknown value and lists the valid ones", () => {
    const r = coerceValue("RETIRED", status);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ACTIVE, ON_LEAVE");
  });
});

describe("coerceValue — currency", () => {
  it("accepts and upcases a known code", () => {
    expect(coerceValue("usd", field({ type: "currency" })).value).toBe("USD");
  });

  it("rejects a made-up code", () => {
    expect(coerceValue("XYZ", field({ type: "currency" })).ok).toBe(false);
  });
});

describe("coerceValue — boolean", () => {
  it.each([["yes", true], ["Y", true], ["1", true], ["true", true], ["no", false], ["0", false]])(
    "reads %s as %s",
    (input, expected) => {
      expect(coerceValue(input, field({ type: "boolean" })).value).toBe(expected);
    },
  );

  it("rejects anything else", () => {
    expect(coerceValue("maybe", field({ type: "boolean" })).ok).toBe(false);
  });
});

describe("parseDate", () => {
  it("parses ISO", () => {
    expect(parseDate("2026-07-17")?.toISOString()).toBe("2026-07-17T00:00:00.000Z");
  });

  it("parses DD.MM.YYYY", () => {
    expect(parseDate("31.12.2027")?.toISOString()).toBe("2027-12-31T00:00:00.000Z");
  });

  it("parses YYYY/MM/DD", () => {
    expect(parseDate("2026/07/17")?.toISOString()).toBe("2026-07-17T00:00:00.000Z");
  });

  it("rejects an ambiguous US-style date rather than guessing", () => {
    // Date.parse("01/02/2026") silently means Jan 2nd to a US runtime and Feb
    // 1st to a European user. Accepting it would corrupt dates without ever
    // erroring, so it is refused and the message names the formats we take.
    expect(parseDate("01/02/2026")).toBeNull();
  });

  it("rejects a date that does not exist", () => {
    // Date rolls Feb 31 over to Mar 3 rather than throwing, which would import
    // a silently wrong date.
    expect(parseDate("2026-02-31")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2026-00-10")).toBeNull();
  });

  it("rejects free text", () => {
    expect(parseDate("next tuesday")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("is timezone-independent (always UTC midnight)", () => {
    const d = parseDate("2026-07-17")!;
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCDate()).toBe(17);
  });
});

describe("coerceValue — date field", () => {
  it("names the accepted formats when it rejects", () => {
    const r = coerceValue("not-a-date", field({ type: "date", label: "Pickup Date" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("YYYY-MM-DD");
  });
});

describe("coerceValue — string length", () => {
  it("enforces maxLength", () => {
    const r = coerceValue("x".repeat(51), field({ maxLength: 50, label: "Code" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Code must be at most 50 characters");
  });
});

describe("coerceValue — reference", () => {
  it("passes the raw text through for the batched resolver", () => {
    // Resolution needs a database, so it is not a pure coercion — see
    // ValidationService.resolveReferences.
    expect(coerceValue("  CUS-0001 ", field({ type: "reference" }))).toEqual({
      ok: true,
      value: "CUS-0001",
    });
  });
});
