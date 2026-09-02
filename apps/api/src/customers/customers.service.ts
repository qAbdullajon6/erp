import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Customer, Prisma, UsageMetricType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowEventService } from "../workflows/triggers/workflow-event.service";
import { UsageMeteringService } from "../billing/usage-metering.service";
import { generateUniqueCustomerCode, isValidCustomerCode } from "./customer-code.util";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly usageMetering: UsageMeteringService,
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
              { taxId: { contains: query.search, mode: "insensitive" } },
              { address: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    // $transaction, not Promise.all: the count and the page must agree on the
    // same snapshot, or a concurrent write between the two reads can show a
    // total that does not match the rows actually returned.
    const [rows, total] = await this.prisma.$transaction([
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
    // Auto-generated codes are check-then-write: two concurrent creates can
    // both compute the same "next" CUS-000N and race the unique constraint.
    // A user-SUPPLIED code has already been existence-checked in
    // resolveCodeForCreate, so a collision there is a real conflict, not a
    // race to retry — only the auto-generated path retries.
    await this.usageMetering.enforceLimit(organizationId, UsageMetricType.CUSTOMERS, 1);

    const isAutoCode = !dto.customerCode;
    let customerCode = await this.resolveCodeForCreate(organizationId, dto.customerCode);

    let customer: Customer | undefined;
    for (let attempt = 0; ; attempt += 1) {
      try {
        customer = await this.prisma.customer.create({
          data: {
            organizationId,
            customerCode,
            companyName: dto.companyName,
            contactName: dto.contactName ?? null,
            email: dto.email,
            phone: dto.phone,
            country: dto.country,
            city: dto.city,
            lat: dto.cityLat != null ? new Prisma.Decimal(dto.cityLat) : null,
            lng: dto.cityLng != null ? new Prisma.Decimal(dto.cityLng) : null,
            geocodedAt: dto.cityLat != null ? new Date() : null,
            address: dto.address,
            postalCode: dto.postalCode,
            taxId: dto.taxId,
            paymentTerms: dto.paymentTerms ?? "NET_30",
            // Store paymentTermsDays for CUSTOM terms; null it out for standard terms
            // so it can never accidentally affect invoice calculations.
            paymentTermsDays: dto.paymentTerms === "CUSTOM"
              ? (dto.paymentTermsDays ?? null)
              : null,
            creditLimit: dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
            currency: dto.currency ?? null,
            deliveryNotes: dto.deliveryNotes,
            internalNotes: dto.internalNotes,
          },
        });
        break;
      } catch (err) {
        const isCodeConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isCodeConflict) throw err;
        if (!isAutoCode || attempt >= 2) {
          throw new ConflictException("A customer with this customerCode already exists in this organization");
        }
        customerCode = await generateUniqueCustomerCode(this.prisma, organizationId);
      }
    }

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "customer.create",
      entityType: "Customer",
      entityId: customer.id,
      metadata: { customerCode: customer.customerCode, companyName: customer.companyName },
    });

    void this.workflowEvents.emit(organizationId, "customer.created", { id: customer.id, customerCode: customer.customerCode, companyName: customer.companyName });

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
        // cityLat/Lng: undefined = leave existing; null = clear; number = set new
        lat: dto.cityLat !== undefined
          ? (dto.cityLat != null ? new Prisma.Decimal(dto.cityLat) : null)
          : undefined,
        lng: dto.cityLng !== undefined
          ? (dto.cityLng != null ? new Prisma.Decimal(dto.cityLng) : null)
          : undefined,
        geocodedAt: dto.cityLat !== undefined
          ? (dto.cityLat != null ? new Date() : null)
          : undefined,
        address: dto.address,
        postalCode: dto.postalCode,
        taxId: dto.taxId,
        paymentTerms: dto.paymentTerms,
        // When changing to CUSTOM, accept the supplied days; when changing away from CUSTOM,
        // always clear paymentTermsDays so it cannot silently affect future invoice logic.
        // undefined (field not in patch) → don't change the existing value.
        paymentTermsDays: dto.paymentTerms !== undefined
          ? (dto.paymentTerms === "CUSTOM" ? (dto.paymentTermsDays ?? null) : null)
          : (dto.paymentTermsDays !== undefined ? dto.paymentTermsDays : undefined),
        creditLimit: dto.creditLimit !== undefined
          ? (dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null)
          : undefined,
        currency: dto.currency,
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

    void this.workflowEvents.emit(organizationId, "customer.updated", { id, companyName: updated.companyName, changes: dto });

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
      // Coordinates: number is safe for lat/lng (no monetary precision concern).
      lat: customer.lat != null ? customer.lat.toNumber() : null,
      lng: customer.lng != null ? customer.lng.toNumber() : null,
      address: customer.address,
      postalCode: customer.postalCode,
      taxId: customer.taxId,
      paymentTerms: customer.paymentTerms,
      paymentTermsDays: customer.paymentTermsDays,
      // Decimal -> string, deliberately not a JS number — see schema.prisma.
      // null = no configured credit ceiling ("No credit limit").
      creditLimit: customer.creditLimit != null ? customer.creditLimit.toString() : null,
      currency: customer.currency,
      status: customer.status,
      deliveryNotes: customer.deliveryNotes,
      internalNotes: customer.internalNotes,
      archivedAt: customer.archivedAt,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
