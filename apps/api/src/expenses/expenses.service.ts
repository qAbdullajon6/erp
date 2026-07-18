import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Expense, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { isValidEntityCode } from "../common/sequential-code.util";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowEventService } from "../workflows/triggers/workflow-event.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { ListExpensesQueryDto } from "./dto/list-expenses-query.dto";
import { RejectExpenseDto } from "./dto/reject-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { generateUniqueExpenseNumber } from "./expense-number.util";

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  async list(organizationId: string, query: ListExpensesQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            expenseDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { expenseNumber: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getById(organizationId: string, id: string) {
    const expense = await this.findOrThrow(organizationId, id);
    return this.toResponse(expense);
  }

  async create(organizationId: string, dto: CreateExpenseDto, actor: CurrentUserPayload) {
    if (dto.orderId) await this.assertOrderExists(organizationId, dto.orderId);
    if (dto.vehicleId) await this.assertVehicleExists(organizationId, dto.vehicleId);
    if (dto.driverId) await this.assertDriverExists(organizationId, dto.driverId);

    const expenseNumber = await this.resolveNumberForCreate(organizationId, dto.expenseNumber);

    const expense = await this.prisma.expense.create({
      data: {
        organizationId,
        expenseNumber,
        orderId: dto.orderId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        category: dto.category,
        description: dto.description,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? "USD",
        notes: dto.notes,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "expense.create",
      entityType: "Expense",
      entityId: expense.id,
      metadata: { expenseNumber, amount: expense.amount.toString() },
    });

    this.workflowEvents.emit(organizationId, "expense.created", { id: expense.id, expenseNumber, amount: expense.amount.toString() });

    return this.toResponse(expense);
  }

  async update(organizationId: string, id: string, dto: UpdateExpenseDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status !== "PENDING") {
      throw new ConflictException(`Only PENDING expenses can be edited (this one is ${existing.status})`);
    }

    if (dto.expenseNumber && dto.expenseNumber !== existing.expenseNumber) {
      await this.assertNumberAvailable(organizationId, dto.expenseNumber);
    }
    if (dto.orderId) await this.assertOrderExists(organizationId, dto.orderId);
    if (dto.vehicleId) await this.assertVehicleExists(organizationId, dto.vehicleId);
    if (dto.driverId) await this.assertDriverExists(organizationId, dto.driverId);

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        expenseNumber: dto.expenseNumber,
        orderId: dto.orderId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        category: dto.category,
        description: dto.description,
        amount: dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        currency: dto.currency,
        notes: dto.notes,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "expense.update",
      entityType: "Expense",
      entityId: id,
      metadata: { changes: dto },
    });

    return this.toResponse(updated);
  }

  async approve(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status !== "PENDING") {
      throw new ConflictException(`Only PENDING expenses can be approved (this one is ${existing.status})`);
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: { status: "APPROVED", approvedByUserId: actor.userId, approvedAt: new Date(), rejectionReason: null },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "expense.approve",
      entityType: "Expense",
      entityId: id,
    });

    this.workflowEvents.emit(organizationId, "expense.approved", { id, expenseNumber: expense.expenseNumber, amount: expense.amount.toString() });

    return this.toResponse(expense);
  }

  async reject(organizationId: string, id: string, dto: RejectExpenseDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status !== "PENDING") {
      throw new ConflictException(`Only PENDING expenses can be rejected (this one is ${existing.status})`);
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: dto.rejectionReason,
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "expense.reject",
      entityType: "Expense",
      entityId: id,
      metadata: { rejectionReason: dto.rejectionReason },
    });

    return this.toResponse(expense);
  }

  private async assertOrderExists(organizationId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, organizationId } });
    if (!order) throw new NotFoundException("Order not found");
  }

  private async assertVehicleExists(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
    if (!vehicle) throw new NotFoundException("Vehicle not found");
  }

  private async assertDriverExists(organizationId: string, driverId: string): Promise<void> {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, organizationId } });
    if (!driver) throw new NotFoundException("Driver not found");
  }

  private async resolveNumberForCreate(organizationId: string, requestedNumber?: string): Promise<string> {
    if (!requestedNumber) {
      return generateUniqueExpenseNumber(this.prisma, organizationId);
    }
    await this.assertNumberAvailable(organizationId, requestedNumber);
    return requestedNumber;
  }

  private async assertNumberAvailable(organizationId: string, expenseNumber: string): Promise<void> {
    if (!isValidEntityCode(expenseNumber)) {
      throw new BadRequestException("expenseNumber may only contain letters, numbers and hyphens");
    }
    const conflict = await this.prisma.expense.findUnique({
      where: { organizationId_expenseNumber: { organizationId, expenseNumber } },
    });
    if (conflict) {
      throw new ConflictException("An expense with this expenseNumber already exists in this organization");
    }
  }

  /// Scoped by organizationId in the query itself, so an expense id from
  /// another organization returns 404. Exported for FinanceService's
  /// profitability calculation.
  async findOrThrow(organizationId: string, id: string): Promise<Expense> {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId } });
    if (!expense) {
      throw new NotFoundException("Expense not found");
    }
    return expense;
  }

  toResponse(expense: Expense) {
    return {
      id: expense.id,
      organizationId: expense.organizationId,
      orderId: expense.orderId,
      vehicleId: expense.vehicleId,
      driverId: expense.driverId,
      expenseNumber: expense.expenseNumber,
      expenseDate: expense.expenseDate,
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      currency: expense.currency,
      status: expense.status,
      approvedByUserId: expense.approvedByUserId,
      approvedAt: expense.approvedAt,
      rejectionReason: expense.rejectionReason,
      notes: expense.notes,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
