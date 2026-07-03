import { isValidEntityCode, nextSequentialCode } from "./sequential-code.util";

describe("isValidEntityCode", () => {
  it("accepts letters, numbers and hyphens", () => {
    expect(isValidEntityCode("EMP-0001")).toBe(true);
    expect(isValidEntityCode("abc123")).toBe(true);
  });

  it("rejects empty strings, spaces, and leading hyphens", () => {
    expect(isValidEntityCode("")).toBe(false);
    expect(isValidEntityCode("has space")).toBe(false);
    expect(isValidEntityCode("-leading-hyphen")).toBe(false);
  });
});

describe("nextSequentialCode", () => {
  it("starts at PREFIX0001 with no existing codes", () => {
    expect(nextSequentialCode([], "EMP-", 4)).toBe("EMP-0001");
  });

  it("continues the sequence based on the highest existing numeric suffix", () => {
    expect(nextSequentialCode(["EMP-0001", "EMP-0002", "EMP-0007"], "EMP-", 4)).toBe("EMP-0008");
  });

  it("ignores non-matching manually-set codes when computing the next number", () => {
    expect(nextSequentialCode(["EMP-0001", "BOB-DRIVER"], "EMP-", 4)).toBe("EMP-0002");
  });

  it("compares suffixes numerically, not lexicographically", () => {
    // "EMP-0002" would sort after "EMP-0010" as plain strings; the highest
    // *number* here is 10, so the next code must be EMP-0011, not EMP-0003.
    expect(nextSequentialCode(["EMP-0002", "EMP-0010"], "EMP-", 4)).toBe("EMP-0011");
  });

  it("scans forward past an exact collision", () => {
    expect(nextSequentialCode(["EMP-0001", "EMP-0002"], "EMP-", 4)).toBe("EMP-0003");
  });

  it("supports a prefix containing regex special characters", () => {
    expect(nextSequentialCode(["ORD-2026-0001"], "ORD-2026-", 4)).toBe("ORD-2026-0002");
  });
});
