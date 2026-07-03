import { PrismaService } from "../prisma/prisma.service";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PAD_LENGTH = 4;

/// Generates the next sequential "ORD-<year>-0001"-style orderNumber for an
/// organization, scoped to the calendar year of `referenceDate` (defaults to
/// now) — the sequence restarts each year, matching the human-readable
/// format the frontend demo already used (e.g. ORD-2026-00125). See
/// common/sequential-code.util.ts for the numeric-suffix algorithm.
export async function generateUniqueOrderNumber(
  prisma: PrismaService,
  organizationId: string,
  referenceDate: Date = new Date(),
): Promise<string> {
  const prefix = `ORD-${referenceDate.getUTCFullYear()}-`;
  const existing = await prisma.order.findMany({
    where: { organizationId, orderNumber: { startsWith: prefix } },
    select: { orderNumber: true },
  });
  return nextSequentialCode(
    existing.map((o) => o.orderNumber),
    prefix,
    CODE_PAD_LENGTH,
  );
}
