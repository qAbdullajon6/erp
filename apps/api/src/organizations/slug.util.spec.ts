import { generateUniqueSlug, slugify } from "./slug.util";
import type { PrismaService } from "../prisma/prisma.service";

describe("slugify", () => {
  it("lowercases, hyphenates, and strips punctuation", () => {
    expect(slugify("Uzbek Textile Group")).toBe("uzbek-textile-group");
    expect(slugify("Acme, Inc.")).toBe("acme-inc");
    expect(slugify("   leading and trailing   ")).toBe("leading-and-trailing");
  });

  it("falls back to a default for input with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("organization");
  });
});

describe("generateUniqueSlug", () => {
  function fakePrisma(existingSlugs: string[]) {
    return {
      organization: {
        findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
          Promise.resolve(existingSlugs.includes(where.slug) ? { id: "existing" } : null),
        ),
      },
    } as unknown as PrismaService;
  }

  it("returns the base slug when it's free", async () => {
    const prisma = fakePrisma([]);
    await expect(generateUniqueSlug(prisma, "Acme Logistics")).resolves.toBe("acme-logistics");
  });

  it("appends a numeric suffix on collision", async () => {
    const prisma = fakePrisma(["acme-logistics", "acme-logistics-2"]);
    await expect(generateUniqueSlug(prisma, "Acme Logistics")).resolves.toBe("acme-logistics-3");
  });
});
