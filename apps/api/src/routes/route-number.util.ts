import { Prisma } from "@prisma/client";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PREFIX = "RTE-";
const CODE_PAD_LENGTH = 6;

export async function generateUniqueRouteNumber(
  prisma: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  const existing = await prisma.route.findMany({
    where: { organizationId, routeNumber: { startsWith: CODE_PREFIX } },
    select: { routeNumber: true },
  });
  return nextSequentialCode(
    existing.map((r) => r.routeNumber),
    CODE_PREFIX,
    CODE_PAD_LENGTH,
  );
}
