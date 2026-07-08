import { Injectable, NotFoundException } from "@nestjs/common";
import {
  MembershipRole,
  Notification,
  NotificationCategory,
  NotificationSettings,
  NotificationSeverity,
  Prisma,
} from "@prisma/client";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { UpdateNotificationSettingsDto } from "./dto/update-notification-settings.dto";
import { categoriesForRole } from "./notification-roles.util";

interface QualifyingEntity {
  entityId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface RuleDefinition {
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  entityType: string;
}

const DEFAULT_ENABLED_CATEGORIES: NotificationCategory[] = ["OPERATIONS", "FINANCE", "CUSTOMERS", "FLEET"];

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  // ---------------------------------------------------------------------
  // Lazy generation — "refresh" reconciles every rule against current DB
  // state on each read. There is no cron/queue in this phase (see
  // docs/REPORTS_NOTIFICATIONS_API.md). Each rule is independent: it
  // computes the current set of qualifying entities, creates a notification
  // for any not already open, and auto-archives ("resolves") any
  // previously-open notification of that type whose entity no longer
  // qualifies — the resolved-condition lifecycle the phase spec asks to be
  // documented.
  // ---------------------------------------------------------------------

  async refresh(organizationId: string): Promise<void> {
    const settings = await this.getOrCreateSettings(organizationId);
    const enabledCategories = settings.enabledCategories as NotificationCategory[];
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() + settings.expiryWarningDays * 24 * 60 * 60 * 1000);
    const dueSoonThreshold = new Date(now.getTime() + settings.invoiceDueSoonDays * 24 * 60 * 60 * 1000);

    // Overdue status must be fresh before we look for INVOICE_OVERDUE rows.
    await this.invoicesService.refreshOverdueInvoices(organizationId);

    const isRuleActive = (category: NotificationCategory, severity: NotificationSeverity): boolean =>
      enabledCategories.includes(category) && (severity !== "LOW" || settings.lowSeverityEnabled);

    const rules: [RuleDefinition, () => Promise<QualifyingEntity[]>][] = [
      [
        { type: "ORDER_DELAYED", category: "OPERATIONS", severity: "HIGH", entityType: "Order" },
        () => this.findDelayedOrders(organizationId, now),
      ],
      [
        { type: "ORDER_UNASSIGNED", category: "OPERATIONS", severity: "MEDIUM", entityType: "Order" },
        () => this.findUnassignedOrders(organizationId),
      ],
      [
        { type: "INVOICE_OVERDUE", category: "FINANCE", severity: "HIGH", entityType: "Invoice" },
        () => this.findOverdueInvoices(organizationId),
      ],
      [
        { type: "INVOICE_DUE_SOON", category: "FINANCE", severity: "LOW", entityType: "Invoice" },
        () => this.findInvoicesDueSoon(organizationId, now, dueSoonThreshold),
      ],
      [
        { type: "CUSTOMER_CREDIT_LIMIT_EXCEEDED", category: "CUSTOMERS", severity: "CRITICAL", entityType: "Customer" },
        () => this.findCreditLimitCustomers(organizationId, settings, "EXCEEDED"),
      ],
      [
        { type: "CUSTOMER_CREDIT_LIMIT_NEAR", category: "CUSTOMERS", severity: "MEDIUM", entityType: "Customer" },
        () => this.findCreditLimitCustomers(organizationId, settings, "NEAR"),
      ],
      [
        { type: "ORDER_NEGATIVE_PROFIT", category: "FINANCE", severity: "HIGH", entityType: "Order" },
        () => this.findNegativeProfitOrders(organizationId),
      ],
      [
        { type: "VEHICLE_INSURANCE_EXPIRY", category: "FLEET", severity: "MEDIUM", entityType: "Vehicle" },
        () => this.findVehicleInsuranceExpiries(organizationId, now, expiryThreshold),
      ],
      [
        { type: "VEHICLE_INSPECTION_EXPIRY", category: "FLEET", severity: "MEDIUM", entityType: "Vehicle" },
        () => this.findVehicleInspectionExpiries(organizationId, now, expiryThreshold),
      ],
      [
        { type: "DRIVER_LICENSE_EXPIRY", category: "FLEET", severity: "MEDIUM", entityType: "Driver" },
        () => this.findDriverLicenseExpiries(organizationId, now, expiryThreshold),
      ],
      [
        { type: "CUSTOMER_AT_RISK", category: "CUSTOMERS", severity: "LOW", entityType: "Customer" },
        () => this.findAtRiskCustomers(organizationId),
      ],
    ];

    for (const [rule, findQualifying] of rules) {
      const active = isRuleActive(rule.category, rule.severity);
      const qualifying = active ? await findQualifying() : [];
      await this.reconcileRule(organizationId, rule, qualifying);
    }
  }

  /// Creates a notification for every qualifying entity not already open,
  /// and archives ("resolves") every open notification of this type whose
  /// entity no longer qualifies (including the entire rule being disabled
  /// via settings, in which case `qualifying` is passed in empty).
  private async reconcileRule(
    organizationId: string,
    rule: RuleDefinition,
    qualifying: QualifyingEntity[],
  ): Promise<void> {
    const openExisting = await this.prisma.notification.findMany({
      where: { organizationId, type: rule.type, isArchived: false },
      select: { id: true, entityId: true },
    });
    const openEntityIds = new Set(openExisting.map((n) => n.entityId));
    const qualifyingIds = new Set(qualifying.map((q) => q.entityId));

    const toCreate = qualifying.filter((q) => !openEntityIds.has(q.entityId));
    if (toCreate.length > 0) {
      await this.prisma.notification.createMany({
        data: toCreate.map((q) => ({
          organizationId,
          type: rule.type,
          category: rule.category,
          severity: rule.severity,
          title: q.title,
          message: q.message,
          entityType: rule.entityType,
          entityId: q.entityId,
          metadata: (q.metadata as Prisma.InputJsonValue) ?? undefined,
        })),
      });
    }

    const toResolve = openExisting.filter((n) => n.entityId && !qualifyingIds.has(n.entityId));
    if (toResolve.length > 0) {
      await this.prisma.notification.updateMany({
        where: { id: { in: toResolve.map((n) => n.id) } },
        data: { isArchived: true, archivedAt: new Date() },
      });
    }
  }

  // --- Rule queries ------------------------------------------------------

  private async findDelayedOrders(organizationId: string, now: Date): Promise<QualifyingEntity[]> {
    const orders = await this.prisma.order.findMany({
      where: { organizationId, status: { notIn: ["DELIVERED", "CANCELLED"] }, deliveryDate: { lt: now } },
      select: { id: true, orderNumber: true, deliveryDate: true },
    });
    return orders.map((o) => ({
      entityId: o.id,
      title: `Order ${o.orderNumber} is delayed`,
      message: `Delivery was due ${o.deliveryDate.toISOString().slice(0, 10)} and the order still isn't marked delivered.`,
      metadata: { orderNumber: o.orderNumber },
    }));
  }

  private async findUnassignedOrders(organizationId: string): Promise<QualifyingEntity[]> {
    const orders = await this.prisma.order.findMany({
      where: { organizationId, status: "PENDING" },
      select: { id: true, orderNumber: true },
    });
    return orders.map((o) => ({
      entityId: o.id,
      title: `Order ${o.orderNumber} is unassigned`,
      message: "Ready for dispatch, but no driver or vehicle has been assigned yet.",
      metadata: { orderNumber: o.orderNumber },
    }));
  }

  private async findOverdueInvoices(organizationId: string): Promise<QualifyingEntity[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId, status: "OVERDUE" },
      select: { id: true, invoiceNumber: true, balanceDue: true, currency: true },
    });
    return invoices.map((i) => ({
      entityId: i.id,
      title: `Invoice ${i.invoiceNumber} is overdue`,
      message: `Balance due: ${i.balanceDue.toString()} ${i.currency}.`,
      metadata: { invoiceNumber: i.invoiceNumber },
    }));
  }

  private async findInvoicesDueSoon(
    organizationId: string,
    now: Date,
    threshold: Date,
  ): Promise<QualifyingEntity[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { gte: now, lte: threshold },
        balanceDue: { gt: 0 },
      },
      select: { id: true, invoiceNumber: true, dueDate: true, balanceDue: true, currency: true },
    });
    return invoices.map((i) => ({
      entityId: i.id,
      title: `Invoice ${i.invoiceNumber} is due soon`,
      message: `Due ${i.dueDate!.toISOString().slice(0, 10)} — balance ${i.balanceDue.toString()} ${i.currency}.`,
      metadata: { invoiceNumber: i.invoiceNumber },
    }));
  }

  private async findCreditLimitCustomers(
    organizationId: string,
    settings: NotificationSettings,
    kind: "EXCEEDED" | "NEAR",
  ): Promise<QualifyingEntity[]> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, creditLimit: { gt: 0 }, status: { not: "ARCHIVED" } },
      select: { id: true, companyName: true, creditLimit: true },
    });
    if (customers.length === 0) return [];

    const balances = await this.prisma.invoice.groupBy({
      by: ["customerId"],
      where: { organizationId, status: { not: "CANCELLED" } },
      _sum: { balanceDue: true },
    });
    const outstandingByCustomer = new Map(
      balances.map((b) => [b.customerId, b._sum.balanceDue ?? new Prisma.Decimal(0)]),
    );

    const results: QualifyingEntity[] = [];
    for (const customer of customers) {
      const outstanding = outstandingByCustomer.get(customer.id) ?? new Prisma.Decimal(0);
      const exceeded = outstanding.gt(customer.creditLimit);
      const warningThreshold = customer.creditLimit.mul(settings.creditLimitWarningPercent).div(100);
      const near = !exceeded && outstanding.gte(warningThreshold);

      if (kind === "EXCEEDED" && exceeded) {
        results.push({
          entityId: customer.id,
          title: `${customer.companyName} has exceeded its credit limit`,
          message: `Outstanding balance ${outstanding.toString()} exceeds the credit limit of ${customer.creditLimit.toString()}.`,
          metadata: { companyName: customer.companyName },
        });
      } else if (kind === "NEAR" && near) {
        results.push({
          entityId: customer.id,
          title: `${customer.companyName} is near its credit limit`,
          message: `Outstanding balance ${outstanding.toString()} is approaching the credit limit of ${customer.creditLimit.toString()}.`,
          metadata: { companyName: customer.companyName },
        });
      }
    }
    return results;
  }

  private async findNegativeProfitOrders(organizationId: string): Promise<QualifyingEntity[]> {
    const deliveredOrders = await this.prisma.order.findMany({
      where: { organizationId, status: "DELIVERED" },
      select: { id: true, orderNumber: true, price: true, currency: true },
    });
    if (deliveredOrders.length === 0) return [];

    const expenseAgg = await this.prisma.expense.groupBy({
      by: ["orderId"],
      where: { organizationId, status: "APPROVED", orderId: { not: null } },
      _sum: { amount: true },
    });
    const expensesByOrder = new Map(expenseAgg.map((e) => [e.orderId as string, e._sum.amount ?? new Prisma.Decimal(0)]));

    const results: QualifyingEntity[] = [];
    for (const order of deliveredOrders) {
      const approvedExpenses = expensesByOrder.get(order.id) ?? new Prisma.Decimal(0);
      const profit = order.price.sub(approvedExpenses);
      if (profit.lt(0)) {
        results.push({
          entityId: order.id,
          title: `Order ${order.orderNumber} is running at a loss`,
          message: `Estimated gross profit ${profit.toString()} ${order.currency} (revenue ${order.price.toString()} − approved expenses ${approvedExpenses.toString()}).`,
          metadata: { orderNumber: order.orderNumber },
        });
      }
    }
    return results;
  }

  private async findVehicleInsuranceExpiries(
    organizationId: string,
    now: Date,
    threshold: Date,
  ): Promise<QualifyingEntity[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, archivedAt: null, insuranceExpiry: { gte: now, lte: threshold } },
      select: { id: true, vehicleCode: true, plateNumber: true, insuranceExpiry: true },
    });
    return vehicles.map((v) => ({
      entityId: v.id,
      title: `Vehicle ${v.vehicleCode} insurance expires soon`,
      message: `${v.plateNumber}'s insurance expires on ${v.insuranceExpiry!.toISOString().slice(0, 10)}.`,
      metadata: { vehicleCode: v.vehicleCode, plateNumber: v.plateNumber },
    }));
  }

  private async findVehicleInspectionExpiries(
    organizationId: string,
    now: Date,
    threshold: Date,
  ): Promise<QualifyingEntity[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, archivedAt: null, inspectionExpiry: { gte: now, lte: threshold } },
      select: { id: true, vehicleCode: true, plateNumber: true, inspectionExpiry: true },
    });
    return vehicles.map((v) => ({
      entityId: v.id,
      title: `Vehicle ${v.vehicleCode} inspection expires soon`,
      message: `${v.plateNumber}'s inspection expires on ${v.inspectionExpiry!.toISOString().slice(0, 10)}.`,
      metadata: { vehicleCode: v.vehicleCode, plateNumber: v.plateNumber },
    }));
  }

  private async findDriverLicenseExpiries(
    organizationId: string,
    now: Date,
    threshold: Date,
  ): Promise<QualifyingEntity[]> {
    const drivers = await this.prisma.driver.findMany({
      where: { organizationId, archivedAt: null, licenseExpiry: { gte: now, lte: threshold } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, licenseExpiry: true },
    });
    return drivers.map((d) => ({
      entityId: d.id,
      title: `${d.firstName} ${d.lastName}'s license expires soon`,
      message: `Driver ${d.employeeCode}'s license expires on ${d.licenseExpiry!.toISOString().slice(0, 10)}.`,
      metadata: { employeeCode: d.employeeCode },
    }));
  }

  private async findAtRiskCustomers(organizationId: string): Promise<QualifyingEntity[]> {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, status: "AT_RISK" },
      select: { id: true, companyName: true },
    });
    return customers.map((c) => ({
      entityId: c.id,
      title: `${c.companyName} is flagged at-risk`,
      message: "This customer's status is AT_RISK — review before extending further credit or service.",
      metadata: { companyName: c.companyName },
    }));
  }

  // --- Public API ----------------------------------------------------------

  async list(organizationId: string, role: MembershipRole, query: ListNotificationsQueryDto) {
    await this.refresh(organizationId);
    const allowedCategories = categoriesForRole(role);

    const where: Prisma.NotificationWhereInput = {
      organizationId,
      category: { in: allowedCategories },
      isArchived: query.isArchived,
      ...(query.category ? { category: query.category } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
    };

    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { organizationId, category: { in: allowedCategories }, isArchived: false, isRead: false },
      }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
      unreadCount,
    };
  }

  async unreadCount(organizationId: string, role: MembershipRole): Promise<{ unreadCount: number }> {
    await this.refresh(organizationId);
    const allowedCategories = categoriesForRole(role);
    const unreadCount = await this.prisma.notification.count({
      where: { organizationId, category: { in: allowedCategories }, isArchived: false, isRead: false },
    });
    return { unreadCount };
  }

  async markRead(organizationId: string, role: MembershipRole, id: string) {
    const notification = await this.findVisibleOrThrow(organizationId, role, id);
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true, readAt: new Date() },
    });
    return this.toResponse(updated);
  }

  async markUnread(organizationId: string, role: MembershipRole, id: string) {
    const notification = await this.findVisibleOrThrow(organizationId, role, id);
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: false, readAt: null },
    });
    return this.toResponse(updated);
  }

  async archive(organizationId: string, role: MembershipRole, id: string) {
    const notification = await this.findVisibleOrThrow(organizationId, role, id);
    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: { isArchived: true, archivedAt: new Date() },
    });
    return this.toResponse(updated);
  }

  async readAll(organizationId: string, role: MembershipRole): Promise<{ updatedCount: number }> {
    const allowedCategories = categoriesForRole(role);
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, category: { in: allowedCategories }, isArchived: false, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async archiveAll(organizationId: string, role: MembershipRole): Promise<{ updatedCount: number }> {
    const allowedCategories = categoriesForRole(role);
    const result = await this.prisma.notification.updateMany({
      where: { organizationId, category: { in: allowedCategories }, isArchived: false },
      data: { isArchived: true, archivedAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async getSettings(organizationId: string) {
    const settings = await this.getOrCreateSettings(organizationId);
    return this.settingsToResponse(settings);
  }

  async updateSettings(organizationId: string, dto: UpdateNotificationSettingsDto) {
    await this.getOrCreateSettings(organizationId);
    const updated = await this.prisma.notificationSettings.update({
      where: { organizationId },
      data: {
        enabledCategories: dto.enabledCategories ? (dto.enabledCategories as Prisma.InputJsonValue) : undefined,
        invoiceDueSoonDays: dto.invoiceDueSoonDays,
        creditLimitWarningPercent: dto.creditLimitWarningPercent,
        expiryWarningDays: dto.expiryWarningDays,
        lowSeverityEnabled: dto.lowSeverityEnabled,
      },
    });
    return this.settingsToResponse(updated);
  }

  private async getOrCreateSettings(organizationId: string): Promise<NotificationSettings> {
    const existing = await this.prisma.notificationSettings.findUnique({ where: { organizationId } });
    if (existing) return existing;
    return this.prisma.notificationSettings.create({
      data: {
        organizationId,
        enabledCategories: DEFAULT_ENABLED_CATEGORIES,
      },
    });
  }

  /// A notification outside the caller's role-allowed categories 404s, the
  /// same "never leak existence outside your scope" treatment this project
  /// gives cross-organization access — here the boundary is role/category
  /// rather than organizationId, but the principle is the same.
  private async findVisibleOrThrow(
    organizationId: string,
    role: MembershipRole,
    id: string,
  ): Promise<Notification> {
    const allowedCategories = categoriesForRole(role);
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId, category: { in: allowedCategories } },
    });
    if (!notification) {
      throw new NotFoundException("Notification not found");
    }
    return notification;
  }

  private toResponse(notification: Notification) {
    return {
      id: notification.id,
      organizationId: notification.organizationId,
      type: notification.type,
      category: notification.category,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      isRead: notification.isRead,
      readAt: notification.readAt,
      isArchived: notification.isArchived,
      archivedAt: notification.archivedAt,
      createdAt: notification.createdAt,
      metadata: notification.metadata,
    };
  }

  private settingsToResponse(settings: NotificationSettings) {
    return {
      enabledCategories: settings.enabledCategories as NotificationCategory[],
      invoiceDueSoonDays: settings.invoiceDueSoonDays,
      creditLimitWarningPercent: settings.creditLimitWarningPercent,
      expiryWarningDays: settings.expiryWarningDays,
      lowSeverityEnabled: settings.lowSeverityEnabled,
      updatedAt: settings.updatedAt,
    };
  }
}
