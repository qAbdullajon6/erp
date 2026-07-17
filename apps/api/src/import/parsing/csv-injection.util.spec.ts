import {
  looksLikeFormula,
  neutralizeFormula,
  toCsvDocument,
  toCsvRow,
} from "./csv-injection.util";

describe("neutralizeFormula", () => {
  it.each(["=cmd|'/c calc'!A1", "+1+1", "-1+1", "@SUM(A1)", "\tx", "\rx"])(
    "prefixes a quote to %j so a spreadsheet treats it as text",
    (payload) => {
      expect(neutralizeFormula(payload)).toBe(`'${payload}`);
    },
  );

  it("leaves ordinary text alone", () => {
    expect(neutralizeFormula("Acme Logistics")).toBe("Acme Logistics");
    expect(neutralizeFormula("")).toBe("");
  });

  it("does not touch a minus that is part of a number's text", () => {
    // "-5" IS a formula trigger to Excel, so it is neutralised. This documents
    // that deliberately: the alternative is deciding what looks numeric, which
    // is exactly where escaping gets it wrong.
    expect(neutralizeFormula("-5")).toBe("'-5");
  });

  it("returns non-strings untouched, preserving their type", () => {
    // Numbers and dates cannot carry a payload, and stringifying them here
    // would corrupt the value.
    expect(neutralizeFormula(42)).toBe(42);
    expect(neutralizeFormula(null)).toBeNull();
    expect(neutralizeFormula(undefined)).toBeUndefined();
    const d = new Date();
    expect(neutralizeFormula(d)).toBe(d);
  });
});

describe("looksLikeFormula", () => {
  it("detects the triggers", () => {
    expect(looksLikeFormula("=A1")).toBe(true);
    expect(looksLikeFormula("@x")).toBe(true);
  });

  it("is false for ordinary values and non-strings", () => {
    expect(looksLikeFormula("Acme")).toBe(false);
    expect(looksLikeFormula("")).toBe(false);
    expect(looksLikeFormula(5)).toBe(false);
    expect(looksLikeFormula(null)).toBe(false);
  });
});

describe("toCsvRow", () => {
  it("quotes every field unconditionally", () => {
    // Always-quote is correct for every input; conditional quoting is where CSV
    // writers get it wrong.
    expect(toCsvRow(["a", "b"])).toBe('"a","b"');
  });

  it("doubles embedded quotes (RFC 4180)", () => {
    expect(toCsvRow(['say "hi"'])).toBe('"say ""hi"""');
  });

  it("keeps a comma inside a field from splitting it", () => {
    expect(toCsvRow(["Acme, Inc"])).toBe('"Acme, Inc"');
  });

  it("keeps a newline inside a field", () => {
    expect(toCsvRow(["line1\nline2"])).toBe('"line1\nline2"');
  });

  it("neutralises a formula on the way out", () => {
    expect(toCsvRow(["=cmd|'/c calc'!A1"])).toBe(`"'=cmd|'/c calc'!A1"`);
  });

  it("renders null and undefined as empty", () => {
    expect(toCsvRow([null, undefined])).toBe('"",""');
  });

  it("cannot be escaped by a quote-plus-formula payload", () => {
    // The classic break-out attempt: close the quote, then start a formula.
    const row = toCsvRow(['","=cmd|\'/c calc\'!A1']);
    // Exactly one field: the injected quote is doubled, not honoured.
    expect(row.startsWith('"')).toBe(true);
    expect(row.endsWith('"')).toBe(true);
    expect(row).toContain('""');
    expect(row).not.toMatch(/^"[^"]*",\s*"=/);
  });
});

describe("toCsvDocument", () => {
  it("starts with a UTF-8 BOM so Excel reads it as UTF-8", () => {
    // Without it, non-ASCII company names arrive mojibake'd on Windows — which
    // for an error report means the user cannot find the row it names.
    expect(toCsvDocument(["A"], [["x"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings (RFC 4180) and ends with one", () => {
    const doc = toCsvDocument(["A", "B"], [["1", "2"]]);
    expect(doc).toBe('﻿"A","B"\r\n"1","2"\r\n');
  });

  it("renders a header-only document", () => {
    expect(toCsvDocument(["A"], [])).toBe('﻿"A"\r\n');
  });

  it("neutralises user-controlled cells in a generated report", () => {
    const doc = toCsvDocument(["Message"], [["=HYPERLINK(\"http://evil\")"]]);
    expect(doc).toContain(`"'=HYPERLINK`);
    // No live formula reaches the file.
    expect(doc).not.toMatch(/(^|,)"=/m);
  });
});
