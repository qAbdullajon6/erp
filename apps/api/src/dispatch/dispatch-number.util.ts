import { PrismaService } from "../prisma/prisma.service";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PREFIX = "DSP-";
const CODE_PAD_LENGTH = 6;

/// Generates the next sequential "DSP-000001", "DSP-000002", ... dispatchNumber
/// for an organization — see common/sequential-code.util.ts for the
/// numeric-suffix algorithm this delegates to.
export async function generateUniqueDispatchNumber(
  prisma: PrismaService,
  organizationId: string,
): Promise<string> {
  const existing = await prisma.dispatch.findMany({
    where: { organizationId, dispatchNumber: { startsWith: CODE_PREFIX } },
    select: { dispatchNumber: true },
  });
  return nextSequentialCode(
    existing.map((d) => d.dispatchNumber),
    CODE_PREFIX,
    CODE_PAD_LENGTH,
  );
}
