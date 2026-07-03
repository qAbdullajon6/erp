import { PrismaService } from "../prisma/prisma.service";

const CODE_PREFIX = "CUS-";
const CODE_PAD_LENGTH = 4;

/// customerCode must be short, printable, and URL/CSV-safe. Applied both to
/// client-supplied codes (create/update) and, defensively, to generated
/// ones.
export function isValidCustomerCode(code: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/.test(code);
}

/// Generates the next sequential "CUS-0001", "CUS-0002", ... code for an
/// organization, based on the highest existing numeric suffix among that
/// org's auto-pattern codes — not on row count or createdAt order, so a
/// manually-edited or deleted code never causes a collision or a gap that
/// breaks the sequence. Falls back to scanning forward on the rare exact
/// collision (e.g. a customer was manually given the "next" code already).
export async function generateUniqueCustomerCode(
  prisma: PrismaService,
  organizationId: string,
): Promise<string> {
  const existing = await prisma.customer.findMany({
    where: { organizationId, customerCode: { startsWith: CODE_PREFIX } },
    select: { customerCode: true },
  });
  const existingCodes = new Set(existing.map((c) => c.customerCode));

  const maxNumber = existing.reduce((max, c) => {
    const match = /^CUS-(\d+)$/.exec(c.customerCode);
    if (!match) return max;
    return Math.max(max, parseInt(match[1], 10));
  }, 0);

  let candidateNumber = maxNumber + 1;
  let candidate = `${CODE_PREFIX}${String(candidateNumber).padStart(CODE_PAD_LENGTH, "0")}`;
  while (existingCodes.has(candidate)) {
    candidateNumber += 1;
    candidate = `${CODE_PREFIX}${String(candidateNumber).padStart(CODE_PAD_LENGTH, "0")}`;
  }

  return candidate;
}
