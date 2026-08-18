import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page = 1, limit = 50, action?: string, organizationId?: string) {
    const where = {
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : { action: { startsWith: "platform." } }),
      ...(organizationId ? { organizationId } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
