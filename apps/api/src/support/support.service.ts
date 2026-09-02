import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import type {
  CreateTicketDto,
  CreateMessageDto,
  ListTicketsQueryDto,
} from "./dto/support.dto";

/// Author shape included in ticket and message responses.
const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ─── Ticket list ─────────────────────────────────────────────────────────

  async listTickets(organizationId: string, query: ListTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where: { organizationId } }),
      this.prisma.supportTicket.findMany({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          subject: true,
          status: true,
          resolutionRequestedAt: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          createdBy: { select: AUTHOR_SELECT },
          _count: { select: { messages: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  // ─── Single ticket with messages ─────────────────────────────────────────

  async getTicket(organizationId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      include: {
        createdBy: { select: AUTHOR_SELECT },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: AUTHOR_SELECT } },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  // ─── Create ticket ────────────────────────────────────────────────────────

  async createTicket(
    organizationId: string,
    dto: CreateTicketDto,
    actor: CurrentUserPayload,
  ) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
        status: "OPEN",
        createdById: actor.userId,
        // Create the opening message so the conversation is populated immediately.
        messages: {
          create: {
            authorId: actor.userId,
            isStaff: false,
            body: dto.body.trim(),
          },
        },
      },
      include: {
        createdBy: { select: AUTHOR_SELECT },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: AUTHOR_SELECT } },
        },
      },
    });
    return ticket;
  }

  // ─── Reply to ticket ──────────────────────────────────────────────────────

  async addMessage(
    organizationId: string,
    ticketId: string,
    dto: CreateMessageDto,
    actor: CurrentUserPayload,
  ) {
    // Verify org ownership before allowing a reply.
    // A CLOSED ticket is not a dead end: this is a chat, one chat = one
    // ticket, and a tenant replying to a closed chat REOPENS it rather than
    // silently forking a brand-new conversation.
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: {
        id: true,
        status: true,
        subject: true,
        resolutionRequestedAt: true,
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const [message] = await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId,
          authorId: actor.userId,
          isStaff: false,
          body: dto.body.trim(),
        },
        include: { author: { select: AUTHOR_SELECT } },
      }),
      // Reopen when the tenant replies to a finished chat.
      ...(ticket.status === "RESOLVED" || ticket.status === "CLOSED"
        ? [
            this.prisma.supportTicket.update({
              where: { id: ticketId },
              data: { status: "OPEN", resolvedAt: null },
            }),
          ]
        : []),
      // A tenant reply is itself an answer to "did this solve it?" — the
      // conversation continues, so withdraw any pending confirmation request
      // instead of leaving the prompt dangling over an active chat.
      ...(ticket.resolutionRequestedAt
        ? [
            this.prisma.supportTicket.update({
              where: { id: ticketId },
              data: { resolutionRequestedAt: null },
            }),
          ]
        : []),
    ]);
    return message;
  }

  // ─── Resolution confirmation flow ─────────────────────────────────────────

  /// Staff marks the issue as solved-pending-confirmation. The ticket stays
  /// OPEN — only when the tenant confirms does it become CLOSED.
  async requestResolutionConfirmation(
    organizationId: string,
    ticketId: string,
  ): Promise<{ id: string; status: string; resolutionRequestedAt: Date | null }> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: { id: true, status: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
      throw new ForbiddenException("This ticket is already finished");
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { resolutionRequestedAt: new Date() },
      select: { id: true, status: true, resolutionRequestedAt: true },
    });
  }

  /// Tenant confirms the answer worked → the chat is CLOSED. (Two-status
  /// model: solved IS closed; there is no separate RESOLVED state anymore.)
  async confirmResolution(
    organizationId: string,
    ticketId: string,
  ): Promise<{ id: string; status: string; resolvedAt: Date | null }> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: { id: true, status: true, resolutionRequestedAt: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (!ticket.resolutionRequestedAt || ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      throw new ForbiddenException("There is no pending confirmation for this ticket");
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "CLOSED", resolvedAt: new Date(), resolutionRequestedAt: null },
      select: { id: true, status: true, resolvedAt: true },
    });
  }

  /// Tenant declines ("no, I still have a question") → back to a plain live
  /// question; the prompt is withdrawn and OPEN stays OPEN.
  async declineResolution(
    organizationId: string,
    ticketId: string,
  ): Promise<{ id: string; status: string; resolutionRequestedAt: Date | null }> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: { id: true, status: true, resolutionRequestedAt: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (!ticket.resolutionRequestedAt) return { id: ticketId, status: ticket.status, resolutionRequestedAt: null };

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { resolutionRequestedAt: null },
      select: { id: true, status: true, resolutionRequestedAt: true },
    });
  }

  // ─── Close ticket ─────────────────────────────────────────────────────────

  async closeTicket(
    organizationId: string,
    ticketId: string,
    _actor: CurrentUserPayload,
  ) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: { id: true, status: true, createdById: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status === "CLOSED") return ticket; // idempotent

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "CLOSED", resolvedAt: new Date() },
      select: { id: true, status: true, resolvedAt: true },
    });
  }

  // ─── Per-user unread count (tickets with unread staff messages) ───────────

  async getUnreadCount(userId: string, organizationId: string): Promise<{ unreadCount: number }> {
    // Find all tickets that have at least one staff message newer than the
    // user's lastReadAt for that ticket (or any staff message if no read row).
    const tickets = await this.prisma.supportTicket.findMany({
      where: { organizationId },
      select: {
        id: true,
        messages: {
          where: { isStaff: true },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        userReads: {
          where: { userId },
          select: { lastReadAt: true },
          take: 1,
        },
      },
    });

    let unreadCount = 0;
    for (const ticket of tickets) {
      const latestStaffMsg = ticket.messages[0];
      if (!latestStaffMsg) continue; // no staff message at all

      const readState = ticket.userReads[0];
      if (!readState || latestStaffMsg.createdAt > readState.lastReadAt) {
        unreadCount++;
      }
    }
    return { unreadCount };
  }

  // ─── Mark ticket as read for this user ───────────────────────────────────

  async markTicketRead(
    organizationId: string,
    ticketId: string,
    userId: string,
  ): Promise<{ ok: boolean }> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    await this.prisma.supportTicketUserRead.upsert({
      where: { userId_ticketId: { userId, ticketId } },
      create: { userId, ticketId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  // ─── AI context summary (safe, org-isolated) ─────────────────────────────

  /// Returns a plain-text summary of the ticket for AI context injection.
  /// Only data the authenticated user is already allowed to read is included.
  /// The client must never send ticket data directly to the AI — this endpoint
  /// is the trusted server-side path that loads and scopes the context.
  async getAiContext(organizationId: string, ticketId: string): Promise<string> {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 10, // last 10 messages — enough context, not a data dump
          select: {
            isStaff: true,
            body: true,
            createdAt: true,
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const statusLabel: Record<string, string> = {
      OPEN: "Open",
      IN_PROGRESS: "In progress",
      RESOLVED: "Resolved",
      CLOSED: "Closed",
    };

    const lines: string[] = [
      `## Support Ticket Context`,
      ``,
      `**Subject:** ${ticket.subject}`,
      `**Status:** ${statusLabel[ticket.status] ?? ticket.status}`,
      `**Opened:** ${ticket.createdAt.toISOString().slice(0, 10)}`,
      ``,
      `### Conversation (${ticket.messages.length} message${ticket.messages.length !== 1 ? "s" : ""})`,
    ];

    for (const msg of ticket.messages) {
      const author = msg.isStaff ? "FlowERP Support" : "Customer";
      const date = msg.createdAt.toISOString().slice(0, 10);
      lines.push(`**${author}** (${date}): ${msg.body.slice(0, 500)}${msg.body.length > 500 ? "…" : ""}`);
    }

    return lines.join("\n");
  }

}
