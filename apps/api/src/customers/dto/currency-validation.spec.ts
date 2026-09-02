/**
 * Unit tests: currency field validation in CreateCustomerDto and UpdateCustomerDto.
 *
 * Verifies that:
 * - null / undefined → accepted (org default)
 * - valid ISO 4217 codes (USD, EUR, UZS, …) → accepted
 * - arbitrary 3-letter strings (ABC, XYZ) → rejected 400
 * - non-3-letter strings, full names, mixed case → rejected 400
 */

import { validate } from "class-validator";
import { CreateCustomerDto } from "./create-customer.dto";
import { UpdateCustomerDto } from "./update-customer.dto";

// ─── CreateCustomerDto ────────────────────────────────────────────────────────

describe("CreateCustomerDto — currency validation", () => {
  function make(currency: unknown): CreateCustomerDto {
    const dto = new CreateCustomerDto();
    dto.companyName = "Test Co";
    if (currency !== undefined) (dto as unknown as Record<string, unknown>).currency = currency;
    return dto;
  }

  it("omitted currency → valid (org default)", async () => {
    const dto = make(undefined);
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === "currency")).toHaveLength(0);
  });

  it.each(["USD", "EUR", "GBP", "UZS", "KZT", "AED", "RUB", "TRY", "CNY", "JPY"])(
    '"%s" → valid ISO 4217 code',
    async (code) => {
      const errors = await validate(make(code));
      expect(errors.filter((e) => e.property === "currency")).toHaveLength(0);
    },
  );

  it("ABC → rejected (3 uppercase letters but not ISO 4217)", async () => {
    const errors = await validate(make("ABC"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it("XYZ → rejected", async () => {
    const errors = await validate(make("XYZ"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"dollar" → rejected (full name, lowercase)', async () => {
    const errors = await validate(make("dollar"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"USDollar" → rejected (too long)', async () => {
    const errors = await validate(make("USDollar"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"usd" → rejected (lowercase)', async () => {
    const errors = await validate(make("usd"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"US" → rejected (too short)', async () => {
    const errors = await validate(make("US"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('empty string "" → rejected', async () => {
    const errors = await validate(make(""));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });
});

// ─── UpdateCustomerDto ────────────────────────────────────────────────────────

describe("UpdateCustomerDto — currency validation", () => {
  function make(currency: unknown): UpdateCustomerDto {
    const dto = new UpdateCustomerDto();
    if (currency !== undefined) (dto as unknown as Record<string, unknown>).currency = currency;
    return dto;
  }

  it("null → valid (clears currency override, uses org default)", async () => {
    const errors = await validate(make(null));
    expect(errors.filter((e) => e.property === "currency")).toHaveLength(0);
  });

  it("omitted currency → valid (leaves unchanged)", async () => {
    const dto = make(undefined);
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === "currency")).toHaveLength(0);
  });

  it.each(["USD", "EUR", "UZS", "KZT", "RUB"])(
    '"%s" → valid ISO 4217 code',
    async (code) => {
      const errors = await validate(make(code));
      expect(errors.filter((e) => e.property === "currency")).toHaveLength(0);
    },
  );

  it("ABC → rejected", async () => {
    const errors = await validate(make("ABC"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"dollar" → rejected', async () => {
    const errors = await validate(make("dollar"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"USDollar" → rejected', async () => {
    const errors = await validate(make("USDollar"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });

  it('"usd" (lowercase) → rejected', async () => {
    const errors = await validate(make("usd"));
    expect(errors.some((e) => e.property === "currency")).toBe(true);
  });
});

// ─── iso4217-currencies sanity ─────────────────────────────────────────────────

import { ISO4217_CODES, isValidIso4217 } from "../../common/iso4217-currencies";

describe("ISO4217_CODES dataset", () => {
  it("contains key currencies", () => {
    for (const code of ["USD", "EUR", "GBP", "JPY", "UZS", "KZT", "AED", "RUB", "CNY", "TRY"]) {
      expect(ISO4217_CODES.has(code)).toBe(true);
    }
  });

  it("does not contain invalid codes", () => {
    for (const bad of ["ABC", "XYZ", "aaa", "dollar", "US", "USDX"]) {
      expect(ISO4217_CODES.has(bad)).toBe(false);
    }
  });

  it("isValidIso4217: null → true (org default)", () => {
    expect(isValidIso4217(null)).toBe(true);
  });

  it("isValidIso4217: undefined → true (org default)", () => {
    expect(isValidIso4217(undefined)).toBe(true);
  });

  it("isValidIso4217: USD → true", () => {
    expect(isValidIso4217("USD")).toBe(true);
  });

  it("isValidIso4217: ABC → false", () => {
    expect(isValidIso4217("ABC")).toBe(false);
  });
});
