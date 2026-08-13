import { isSupportedTimezone } from "./timezone.util";

describe("isSupportedTimezone", () => {
  it("accepts IANA zone names the app actually uses", () => {
    expect(isSupportedTimezone("UTC")).toBe(true);
    expect(isSupportedTimezone("Asia/Tashkent")).toBe(true);
    expect(isSupportedTimezone("America/New_York")).toBe(true);
  });

  it("rejects strings Intl cannot resolve", () => {
    expect(isSupportedTimezone("Mars/Phobos")).toBe(false);
    expect(isSupportedTimezone("Not A Zone")).toBe(false);
  });

  it("rejects blank input rather than letting it fall through as valid", () => {
    expect(isSupportedTimezone("")).toBe(false);
    expect(isSupportedTimezone("   ")).toBe(false);
  });

  /// The guard exists because these consumers throw RangeError on a bad zone.
  it("agrees with the Intl consumers downstream", () => {
    const zone = "Asia/Tashkent";
    expect(isSupportedTimezone(zone)).toBe(true);
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date())).not.toThrow();
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: "Mars/Phobos" })).toThrow();
  });
});
