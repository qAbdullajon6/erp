import { PrismaService } from "../prisma/prisma.service";
import { nextSequentialCode } from "../common/sequential-code.util";

const CODE_PAD_LENGTH = 4;

/// Generates the next sequential "INV-<year>-0001"-style invoiceNumber for
/// an organization, scoped to the calendar year of `referenceDate` — same
/// per-year-restart pattern as Order.orderNumber (see order-number.util.ts).
export async function generateUniqueInvoiceNumber(
  prisma: PrismaService,
  organizationId: string,
  referenceDate: Date = new Date(),
): Promise<string> {
  const prefix = `INV-${referenceDate.getUTCFullYear()}-`;
  const existing = await prisma.invoice.findMany({
    where: { organizationId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  return nextSequentialCode(
    existing.map((i) => i.invoiceNumber),
    prefix,
    CODE_PAD_LENGTH,
  );
}
