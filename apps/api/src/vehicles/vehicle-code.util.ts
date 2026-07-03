import { PrismaService } from "../prisma/prisma.service";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PREFIX = "VEH-";
const CODE_PAD_LENGTH = 4;

/// Generates the next sequential "VEH-0001", "VEH-0002", ... vehicleCode
/// for an organization — see common/sequential-code.util.ts for the
/// numeric-suffix algorithm this delegates to.
export async function generateUniqueVehicleCode(
  prisma: PrismaService,
  organizationId: string,
): Promise<string> {
  const existing = await prisma.vehicle.findMany({
    where: { organizationId, vehicleCode: { startsWith: CODE_PREFIX } },
    select: { vehicleCode: true },
  });
  return nextSequentialCode(
    existing.map((v) => v.vehicleCode),
    CODE_PREFIX,
    CODE_PAD_LENGTH,
  );
}
