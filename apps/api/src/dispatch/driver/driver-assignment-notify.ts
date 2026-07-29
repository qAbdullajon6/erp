import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/// Creates a driver-targeted assignment notification without touching the
/// dispatch status machine. Notifications are org-scoped; drivers read them
/// via GET /drivers/me/notifications filtered by metadata.forDriverUserId.
export async function notifyDriverOfAssignment(
  prisma: PrismaService | Prisma.TransactionClient,
  input: {
    organizationId: string;
    driverId: string;
    dispatchId: string;
    dispatchNumber: string;
    reason?: "assigned" | "reassigned";
  },
): Promise<void> {
  const driver = await prisma.driver.findFirst({
    where: {
      id: input.driverId,
      organizationId: input.organizationId,
      archivedAt: null,
    },
    select: { id: true, userId: true, firstName: true },
  });
  if (!driver?.userId) return;

  const reason = input.reason ?? "assigned";
  const title = reason === "reassigned" ? "Job reassigned to you" : "New assignment";
  const message =
    reason === "reassigned"
      ? `${input.dispatchNumber} was reassigned to you. Accept or reject when ready.`
      : `${input.dispatchNumber} was assigned to you. Accept or reject when ready.`;

  // Dedupe: one open unread assignment notice per dispatch for this driver.
  const existing = await prisma.notification.findFirst({
    where: {
      organizationId: input.organizationId,
      type: "DRIVER_NEW_ASSIGNMENT",
      entityType: "Dispatch",
      entityId: input.dispatchId,
      isArchived: false,
      isRead: false,
    },
  });
  if (existing) {
    const meta = (existing.metadata ?? {}) as { forDriverUserId?: string };
    if (meta.forDriverUserId === driver.userId) return;
  }

  await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      type: "DRIVER_NEW_ASSIGNMENT",
      category: "OPERATIONS",
      severity: "HIGH",
      title,
      message,
      entityType: "Dispatch",
      entityId: input.dispatchId,
      metadata: {
        forDriverUserId: driver.userId,
        forDriverId: driver.id,
        dispatchNumber: input.dispatchNumber,
        reason,
      } satisfies Prisma.InputJsonObject,
    },
  });
}
