import { Injectable, NotFoundException } from "@nestjs/common";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderNoteDto } from "./dto/create-order-note.dto";
import { UpdateOrderNoteDto } from "./dto/update-order-note.dto";

@Injectable()
export class OrderNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, orderId: string) {
    await this.assertOrderExists(organizationId, orderId);
    const rows = await this.prisma.orderNote.findMany({
      where: { organizationId, orderId },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return { items: rows };
  }

  async create(
    organizationId: string,
    orderId: string,
    dto: CreateOrderNoteDto,
    actor: CurrentUserPayload,
  ) {
    await this.assertOrderExists(organizationId, orderId);
    const note = await this.prisma.orderNote.create({
      data: {
        organizationId,
        orderId,
        body: dto.body.trim(),
        authorUserId: actor.userId,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.note.create",
      entityType: "Order",
      entityId: orderId,
      metadata: { noteId: note.id, note: note.body.slice(0, 120) },
    });

    return note;
  }

  async update(
    organizationId: string,
    orderId: string,
    noteId: string,
    dto: UpdateOrderNoteDto,
    actor: CurrentUserPayload,
  ) {
    const existing = await this.prisma.orderNote.findFirst({
      where: { id: noteId, organizationId, orderId },
    });
    if (!existing) {
      throw new NotFoundException("Note not found");
    }

    const note = await this.prisma.orderNote.update({
      where: { id: noteId },
      data: { body: dto.body.trim() },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.note.update",
      entityType: "Order",
      entityId: orderId,
      metadata: { noteId: note.id, note: note.body.slice(0, 120) },
    });

    return note;
  }

  async delete(organizationId: string, orderId: string, noteId: string, actor: CurrentUserPayload) {
    const note = await this.prisma.orderNote.findFirst({
      where: { id: noteId, organizationId, orderId },
    });
    if (!note) {
      throw new NotFoundException("Note not found");
    }

    await this.prisma.orderNote.delete({ where: { id: noteId } });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "order.note.delete",
      entityType: "Order",
      entityId: orderId,
      metadata: { noteId },
    });
  }

  private async assertOrderExists(organizationId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
  }
}
