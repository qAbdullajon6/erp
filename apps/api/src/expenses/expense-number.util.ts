import { PrismaService } from "../prisma/prisma.service";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PAD_LENGTH = 4;

/// Generates the next sequential "EXP-<year>-0001"-style expenseNumber for
/// an organization — same per-year-restart pattern as Order.orderNumber /
/// Invoice.invoiceNumber.
export async function generateUniqueExpenseNumber(
  prisma: PrismaService,
  organizationId: string,
  referenceDate: Date = new Date(),
): Promise<string> {
  const prefix = `EXP-${referenceDate.getUTCFullYear()}-`;
  const existing = await prisma.expense.findMany({
    where: { organizationId, expenseNumber: { startsWith: prefix } },
    select: { expenseNumber: true },
  });
  return nextSequentialCode(
    existing.map((e) => e.expenseNumber),
    prefix,
    CODE_PAD_LENGTH,
  );
}
