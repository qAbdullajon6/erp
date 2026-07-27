import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStaff() {
    return this.prisma.user.findMany({
      where: { isPlatformAdmin: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { email: "asc" },
    });
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        isPlatformAdmin: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async setPlatformAdmin(userId: string, isPlatformAdmin: boolean, actor: CurrentUserPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isPlatformAdmin },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isPlatformAdmin: true,
      },
    });

    await this.audit.log({
      actorUserId: actor.userId,
      action: isPlatformAdmin ? "platform.staff.grant" : "platform.staff.revoke",
      entityType: "User",
      entityId: userId,
      metadata: { email: user.email },
    });

    return updated;
  }
}
