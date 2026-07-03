import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Customer, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { generateUniqueCustomerCode, isValidCustomerCode } from "./customer-code.util";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, query: ListCustomersQueryDto) {
    const where: Prisma.CustomerWhereInput = {
      organizationId,
      ...(query.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { customerCode: { contains: query.search, mode: "insensitive" } },
              { companyName: { contains: query.search, mode: "insensitive" } },
              { contactName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { city: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
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
    const customer = await this.findOrThrow(organizationId, id);
    return this.toResponse(customer);
  }

  async create(organizationId: string, dto: CreateCustomerDto, actor: CurrentUserPayload) {
    const customerCode = await this.resolveCodeForCreate(organizationId, dto.customerCode);

    const customer = await this.prisma.customer.create({
      data: {
        organizationId,
        customerCode,
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        country: dto.country,
        city: dto.city,
        address: dto.address,
        taxId: dto.taxId,
        paymentTerms: dto.paymentTerms ?? "NET_30",
        creditLimit: new Prisma.Decimal(dto.creditLimit ?? 0),
        deliveryNotes: dto.deliveryNotes,
        internalNotes: dto.internalNotes,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "customer.create",
      entityType: "Customer",
      entityId: customer.id,
      metadata: { customerCode: customer.customerCode, companyName: customer.companyName },
    });

    return this.toResponse(customer);
  }

  async update(organizationId: string, id: string, dto: UpdateCustomerDto, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);

    if (existing.status === "ARCHIVED") {
      throw new ConflictException("This customer is archived — restore it first to make changes");
    }

    if (dto.customerCode && dto.customerCode !== existing.customerCode) {
      await this.assertCodeAvailable(organizationId, dto.customerCode);
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        customerCode: dto.customerCode,
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        country: dto.country,
        city: dto.city,
        address: dto.address,
        taxId: dto.taxId,
        paymentTerms: dto.paymentTerms,
        creditLimit: dto.creditLimit !== undefined ? new Prisma.Decimal(dto.creditLimit) : undefined,
        status: dto.status,
        deliveryNotes: dto.deliveryNotes,
        internalNotes: dto.internalNotes,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "customer.update",
      entityType: "Customer",
      entityId: id,
      metadata: { changes: dto },
    });

    return this.toResponse(updated);
  }

  async archive(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status === "ARCHIVED") {
      throw new ConflictException("Customer is already archived");
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "customer.archive",
      entityType: "Customer",
      entityId: id,
    });

    return this.toResponse(customer);
  }

  async restore(organizationId: string, id: string, actor: CurrentUserPayload) {
    const existing = await this.findOrThrow(organizationId, id);
    if (existing.status !== "ARCHIVED") {
      throw new ConflictException("Customer is not archived");
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: "ACTIVE", archivedAt: null },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "customer.restore",
      entityType: "Customer",
      entityId: id,
    });

    return this.toResponse(customer);
  }

  private async resolveCodeForCreate(organizationId: string, requestedCode?: string): Promise<string> {
    if (!requestedCode) {
      return generateUniqueCustomerCode(this.prisma, organizationId);
    }
    await this.assertCodeAvailable(organizationId, requestedCode);
    return requestedCode;
  }

  private async assertCodeAvailable(organizationId: string, customerCode: string): Promise<void> {
    if (!isValidCustomerCode(customerCode)) {
      throw new BadRequestException("customerCode may only contain letters, numbers and hyphens");
    }
    const conflict = await this.prisma.customer.findUnique({
      where: { organizationId_customerCode: { organizationId, customerCode } },
    });
    if (conflict) {
      throw new ConflictException("A customer with this customerCode already exists in this organization");
    }
  }

  /// Scoped by organizationId in the query itself (not filtered afterward),
  /// so a customer id from another organization returns 404 — never leaking
  /// whether it exists elsewhere.
  private async findOrThrow(organizationId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({ where: { id, organizationId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  private toResponse(customer: Customer) {
    return {
      id: customer.id,
      organizationId: customer.organizationId,
      customerCode: customer.customerCode,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      country: customer.country,
      city: customer.city,
      address: customer.address,
      taxId: customer.taxId,
      paymentTerms: customer.paymentTerms,
      // Decimal -> string, deliberately not a JS number — see schema.prisma.
      creditLimit: customer.creditLimit.toString(),
      status: customer.status,
      deliveryNotes: customer.deliveryNotes,
      internalNotes: customer.internalNotes,
      archivedAt: customer.archivedAt,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
