import { PrismaService } from "../prisma/prisma.service";

/// Lowercase, alphanumeric-and-hyphen, no leading/trailing/duplicate hyphens.
/// "Uzbek Textile Group" -> "uzbek-textile-group".
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base.length > 0 ? base : "organization";
}

/// Appends -2, -3, ... until a free slug is found. Bounded so a pathological
/// run of collisions can't loop forever; falls back to a short random
/// suffix past that point (extremely unlikely to ever be needed in practice).
export async function generateUniqueSlug(prisma: PrismaService, name: string): Promise<string> {
  const base = slugify(name);
  const MAX_SEQUENTIAL_ATTEMPTS = 25;

  for (let attempt = 0; attempt <= MAX_SEQUENTIAL_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${randomSuffix}`;
}
