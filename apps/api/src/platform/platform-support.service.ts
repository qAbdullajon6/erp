import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, SupportTicketStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SupportRealtimeService } from "../support/realtime/support-realtime.service";
import { MailService } from "../mail/mail.service";
import type { InvitationConfig } from "../config/configuration";
import { ConfigService } from "@nestjs/config";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import type {
  CreateSupportTicketDto,
  ListSupportTicketsQueryDto,
  UpdateSupportTicketDto,
} from "./dto/support-ticket.dto";

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

@Injectable()
export class PlatformSupportService {
  private readonly logger = new Logger(PlatformSupportService.name);
  private readonly appPublicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly supportRealtime: SupportRealtimeService,
  ) {
    this.appPublicUrl =
      this.configService.get<InvitationConfig>("invitation")!.appPublicUrl.replace(/\/+$/, "");
  }

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
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organization: { select: { id: true, name: true, slug: true, status: true } },
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, isStaff: true, body: true } },
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
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  /// Post a staff reply to a ticket and notify the tenant organization.
  async addStaffMessage(
    id: string,
    body: string,
    actor: CurrentUserPayload,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        organizationId: true,
        subject: true,
        createdBy: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const [message] = await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId: id,
          authorId: actor.userId,
          isStaff: true,
          body: body.trim(),
        },
        include: {
          author: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      // Two-status model: a staff reply no longer flips the status. OPEN
      // ("questions") stays until the tenant confirms the issue is solved,
      // at which point the ticket closes.
    ]);

    await this.audit.log({
      organizationId: ticket.organizationId,
      actorUserId: actor.userId,
      action: "platform.support.message",
      entityType: "SupportTicket",
      entityId: id,
    });

    // Publish realtime SSE event — void so failure never blocks the REST reply.
    if (ticket.organizationId) {
      void Promise.resolve().then(() => {
        this.supportRealtime.publish(ticket.organizationId!, {
          type: "support.message.created",
          ticketId: id,
          message: {
            id: message.id,
            ticketId: id,
            isStaff: true,
            body: body.trim(),
            createdAt: message.createdAt.toISOString(),
            // Author info deliberately omitted — staff identity is platform-internal.
            author: null,
          },
        });
      }).catch(() => { /* never throws */ });
    }

    // Send transactional email to the ticket creator if they have an email address.
    // Wrapped in void + catch so email failure never blocks the staff reply.
    if (ticket.createdBy?.email) {
      const recipientName =
        ticket.createdBy.firstName && ticket.createdBy.lastName
          ? `${ticket.createdBy.firstName} ${ticket.createdBy.lastName}`
          : ticket.createdBy.email;

      const preview =
        body.trim().length > 160 ? body.trim().slice(0, 160) + "…" : body.trim();

      // Status is no longer derived from replies (two-status model).
      const ticketUrl = `${this.appPublicUrl}/app?openSupportTicket=${id}`;

      void this.mailService
        .sendSupportReplyEmail({
          to: ticket.createdBy.email,
          recipientName,
          ticketSubject: ticket.subject,
          messagePreview: preview,
          ticketStatus: STATUS_LABEL[ticket.status],
          ticketUrl,
        })
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to send support reply email for ticket ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return message;
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

  /// Staff asks the tenant "did this solve it?" — sets resolutionRequestedAt.
  /// The ticket deliberately stays OPEN; only the tenant's confirmation closes
  /// it. This replaces the old behaviour of prompting the user after every
  /// staff reply.
  async requestResolutionConfirmation(id: string, actor: CurrentUserPayload) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true, organizationId: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
      throw new BadRequestException("This ticket is already finished");
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { resolutionRequestedAt: new Date() },
      select: { id: true, status: true, resolutionRequestedAt: true },
    });

    await this.audit.log({
      organizationId: ticket.organizationId,
      actorUserId: actor.userId,
      action: "platform.support.resolution_requested",
      entityType: "SupportTicket",
      entityId: id,
    });

    return updated;
  }

  async update(id: string, dto: UpdateSupportTicketDto, actor: CurrentUserPayload) {
    const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Ticket not found");

    const resolvedStatuses: SupportTicketStatus[] = ["RESOLVED", "CLOSED"];
    const data: Prisma.SupportTicketUpdateInput = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
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
