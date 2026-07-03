import { PrismaService } from "../prisma/prisma.service";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PREFIX = "EMP-";
const CODE_PAD_LENGTH = 4;

/// Generates the next sequential "EMP-0001", "EMP-0002", ... employeeCode
/// for an organization — see common/sequential-code.util.ts for the
/// numeric-suffix algorithm this delegates to.
export async function generateUniqueDriverCode(
  prisma: PrismaService,
  organizationId: string,
): Promise<string> {
  const existing = await prisma.driver.findMany({
    where: { organizationId, employeeCode: { startsWith: CODE_PREFIX } },
    select: { employeeCode: true },
  });
  return nextSequentialCode(
    existing.map((d) => d.employeeCode),
    CODE_PREFIX,
    CODE_PAD_LENGTH,
  );
}
