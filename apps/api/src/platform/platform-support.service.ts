import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SupportTicketStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import type {
  CreateSupportTicketDto,
  ListSupportTicketsQueryDto,
  UpdateSupportTicketDto,
} from "./dto/support-ticket.dto";

@Injectable()
export class PlatformSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListSupportTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: "insensitive" } },
              { body: { contains: query.search, mode: "insensitive" } },
              { organization: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organization: { select: { id: true, name: true, slug: true, status: true } },
          assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getById(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async create(dto: CreateSupportTicketDto, actor: CurrentUserPayload) {
    if (dto.organizationId) {
      const org = await this.prisma.organization.findFirst({
        where: { id: dto.organizationId, deletedAt: null },
      });
      if (!org) throw new BadRequestException("Organization not found");
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: dto.organizationId,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
        priority: dto.priority ?? "MEDIUM",
        createdById: actor.userId,
      },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    await this.audit.log({
      organizationId: dto.organizationId ?? null,
      actorUserId: actor.userId,
      action: "platform.support.create",
      entityType: "SupportTicket",
      entityId: ticket.id,
    });

    return ticket;
  }

  async update(id: string, dto: UpdateSupportTicketDto, actor: CurrentUserPayload) {
    const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Ticket not found");

    const resolvedStatuses: SupportTicketStatus[] = ["RESOLVED", "CLOSED"];
    const data: Prisma.SupportTicketUpdateInput = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.assigneeUserId !== undefined
        ? dto.assigneeUserId === null
          ? { assignee: { disconnect: true } }
          : { assignee: { connect: { id: dto.assigneeUserId } } }
        : {}),
      ...(dto.status && resolvedStatuses.includes(dto.status) && !existing.resolvedAt
        ? { resolvedAt: new Date() }
        : {}),
    };

    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data,
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    await this.audit.log({
      organizationId: ticket.organizationId,
      actorUserId: actor.userId,
      action: "platform.support.update",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { ...dto },
    });

    return ticket;
  }
}
