import { generateUniqueCustomerCode, isValidCustomerCode } from "./customer-code.util";
import type { PrismaService } from "../prisma/prisma.service";

describe("isValidCustomerCode", () => {
  it("accepts letters, numbers and hyphens", () => {
    expect(isValidCustomerCode("CUS-0001")).toBe(true);
    expect(isValidCustomerCode("abc123")).toBe(true);
  });

  it("rejects empty strings, spaces, and leading hyphens", () => {
    expect(isValidCustomerCode("")).toBe(false);
    expect(isValidCustomerCode("has space")).toBe(false);
    expect(isValidCustomerCode("-leading-hyphen")).toBe(false);
  });
});

describe("generateUniqueCustomerCode", () => {
  function fakePrisma(existingCodes: string[]) {
    return {
      customer: {
        findMany: jest.fn(() =>
          Promise.resolve(existingCodes.map((customerCode) => ({ customerCode }))),
        ),
      },
    } as unknown as PrismaService;
  }

  it("starts at CUS-0001 for an organization with no customers yet", async () => {
    const prisma = fakePrisma([]);
    await expect(generateUniqueCustomerCode(prisma, "org-1")).resolves.toBe("CUS-0001");
  });

  it("continues the sequence based on the highest existing numeric suffix", async () => {
    const prisma = fakePrisma(["CUS-0001", "CUS-0002", "CUS-0007"]);
    await expect(generateUniqueCustomerCode(prisma, "org-1")).resolves.toBe("CUS-0008");
  });

  it("ignores non-matching manually-set codes when computing the next number", async () => {
    const prisma = fakePrisma(["CUS-0001", "ACME-MAIN"]);
    await expect(generateUniqueCustomerCode(prisma, "org-1")).resolves.toBe("CUS-0002");
  });

  it("compares suffixes numerically, not lexicographically", async () => {
    // "CUS-0002" would sort after "CUS-0010" as plain strings; the highest
    // *number* here is 10, so the next code must be CUS-0011, not CUS-0003.
    const prisma = fakePrisma(["CUS-0002", "CUS-0010"]);
    await expect(generateUniqueCustomerCode(prisma, "org-1")).resolves.toBe("CUS-0011");
  });
});
