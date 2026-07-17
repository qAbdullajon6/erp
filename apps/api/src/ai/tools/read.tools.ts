import { Injectable } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomersService } from "../../customers/customers.service";
import { OrdersService } from "../../orders/orders.service";
import { DriversService } from "../../drivers/drivers.service";
import { VehiclesService } from "../../vehicles/vehicles.service";
import { InvoicesService } from "../../invoices/invoices.service";
import { DispatchesService } from "../../dispatch/dispatches.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { ImportService } from "../../import/import.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { AiTool } from "./tool.interface";

/// Role sets, mirroring the equivalent HTTP controllers. The Copilot must not
/// be a way around the API's own authorization, so these are copied from the
/// controllers rather than invented.
const ALL_STAFF: readonly MembershipRole[] = [
  "ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT", "SALES_CRM_MANAGER",
];
const OPS: readonly MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
const FINANCE: readonly MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "ACCOUNTANT"];
const ADMIN_OPS: readonly MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

/// A tiny result is the point.
///
/// Tools return the few fields the model needs to answer, never the raw entity.
/// Three reasons: the prompt has a token budget and a full Order is ~40 fields;
/// every field returned is a field that can end up in an answer, so trimming is
/// data minimisation; and a narrow shape stops the model inventing that a field
/// exists because it saw a null once.
const PAGE_SIZE = 10;

@Injectable()
export class ReadTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly orders: OrdersService,
    private readonly drivers: DriversService,
    private readonly vehicles: VehiclesService,
    private readonly invoices: InvoicesService,
    private readonly dispatches: DispatchesService,
    private readonly notifications: NotificationsService,
    private readonly imports: ImportService,
  ) {}

  /// Resolves customer ids to names for a page of results.
  ///
  /// The Orders and Invoices list responses are flat — they carry customerId,
  /// not a nested customer. Returning a raw UUID to the model would have it
  /// answer "the order for 7d4c76dd-…", which is useless to a dispatcher, so
  /// the names are looked up here.
  ///
  /// ONE query for the whole page, keyed by id — not one per row. This is the
  /// N+1 that a "just fetch the customer for each order" implementation would
  /// have introduced, ten times per tool call.
  private async customerNames(
    organizationId: string,
    customerIds: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(customerIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.customer.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, companyName: true },
    });
    return new Map(rows.map((r) => [r.id, r.companyName]));
  }

  all(): AiTool[] {
    return [
      this.searchCustomers(),
      this.searchOrders(),
      this.searchDrivers(),
      this.searchVehicles(),
      this.searchDispatches(),
      this.searchInvoices(),
      this.listNotifications(),
      this.importStatus(),
    ];
  }

  private searchCustomers(): AiTool {
    return {
      name: "search_customers",
      description:
        "Search the organization's customers by company name, contact or code. " +
        "Use this to resolve a customer the user named in plain language into a real record before acting on it.",
      allowedRoles: ALL_STAFF,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string", description: "Name, contact or customer code to search for." },
          status: {
            type: "string",
            enum: ["ACTIVE", "AT_RISK", "INACTIVE", "ARCHIVED"],
            description: "Optional status filter.",
          },
          limit: { type: "integer", minimum: 1, maximum: 25, description: `Max results (default ${PAGE_SIZE}).` },
        },
      },
      handler: async (args, actor) => {
        const result = await this.customers.list(actor.organizationId, {
          search: str(args.search),
          status: str(args.status) as never,
          page: 1,
          limit: limitOf(args),
        } as never);
        return {
          total: result.meta.total,
          items: result.items.map((c) => ({
            id: c.id,
            customerCode: c.customerCode,
            companyName: c.companyName,
            contactName: c.contactName,
            city: c.city,
            status: c.status,
          })),
        };
      },
    };
  }

  private searchOrders(): AiTool {
    return {
      name: "search_orders",
      description:
        "Search orders by number, city, status, customer, driver or vehicle. " +
        "Use this to find the order a user is referring to, or to answer questions about order volume and status.",
      allowedRoles: ALL_STAFF,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string", description: "Order number or city." },
          status: {
            type: "string",
            enum: ["DRAFT", "PENDING", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CANCELLED"],
          },
          customerId: { type: "string", description: "Customer UUID, from search_customers." },
          driverId: { type: "string", description: "Driver UUID, from search_drivers." },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.orders.list(actor.organizationId, {
          search: str(args.search),
          status: str(args.status) as never,
          customerId: str(args.customerId),
          driverId: str(args.driverId),
          page: 1,
          limit: limitOf(args),
        } as never);

        const names = await this.customerNames(
          actor.organizationId,
          result.items.map((o) => o.customerId),
        );

        return {
          total: result.meta.total,
          items: result.items.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            customer: names.get(o.customerId) ?? null,
            pickupCity: o.pickupCity,
            deliveryCity: o.deliveryCity,
            deliveryDate: o.deliveryDate,
            price: o.price,
            currency: o.currency,
          })),
        };
      },
    };
  }

  private searchDrivers(): AiTool {
    return {
      name: "search_drivers",
      description:
        "Search drivers by name, employee code or status. Use this to resolve a driver named in plain language, " +
        "or to answer who is ACTIVE / ON_LEAVE.",
      // Fleet data is dispatcher-and-up: a SALES_CRM_MANAGER has no business
      // reason for the roster, matching DriversController's own guard.
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE", "ON_LEAVE"] },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.drivers.list(actor.organizationId, {
          search: str(args.search),
          status: str(args.status) as never,
          page: 1,
          limit: limitOf(args),
        } as never);
        return {
          total: result.meta.total,
          items: result.items.map((d) => ({
            id: d.id,
            employeeCode: d.employeeCode,
            name: `${d.firstName} ${d.lastName}`,
            status: d.status,
            phone: d.phone,
          })),
        };
      },
    };
  }

  private searchVehicles(): AiTool {
    return {
      name: "search_vehicles",
      description:
        "Search vehicles by plate, code, type or status. Also use this to answer which vehicles need " +
        "inspection or insurance renewal — check inspectionExpiry / insuranceExpiry on the results.",
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string" },
          status: { type: "string", enum: ["AVAILABLE", "IN_USE", "MAINTENANCE", "INACTIVE"] },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.vehicles.list(actor.organizationId, {
          search: str(args.search),
          status: str(args.status) as never,
          page: 1,
          limit: limitOf(args),
        } as never);
        return {
          total: result.meta.total,
          items: result.items.map((v) => ({
            id: v.id,
            vehicleCode: v.vehicleCode,
            plateNumber: v.plateNumber,
            type: v.type,
            status: v.status,
            insuranceExpiry: v.insuranceExpiry,
            inspectionExpiry: v.inspectionExpiry,
          })),
        };
      },
    };
  }

  private searchDispatches(): AiTool {
    return {
      name: "search_dispatches",
      description:
        "Search dispatches (the operational execution of orders) by status, driver or vehicle. " +
        "Use this to summarise today's dispatch board or find what a driver is currently on.",
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["DRAFT", "ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT", "DELIVERED", "CANCELLED"],
          },
          driverId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.dispatches.list(actor.organizationId, {
          status: str(args.status) as never,
          driverId: str(args.driverId),
          page: 1,
          limit: limitOf(args),
        } as never);
        return {
          total: result.meta.total,
          items: result.items.map((d) => ({
            id: d.id,
            status: d.status,
            orderNumber: d.order?.orderNumber ?? null,
            driver: d.driver ? `${d.driver.firstName} ${d.driver.lastName}` : null,
            vehicle: d.vehicle?.plateNumber ?? null,
          })),
        };
      },
    };
  }

  private searchInvoices(): AiTool {
    return {
      name: "search_invoices",
      description:
        "Search invoices by number, status or customer. Use this for questions about unpaid or overdue " +
        "invoices — filter status to OVERDUE, or SENT/PARTIALLY_PAID for outstanding balances.",
      // Finance data is accountant-and-up. A DISPATCHER asking about invoices
      // is told the capability does not exist, matching InvoicesController.
      allowedRoles: FINANCE,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          search: { type: "string" },
          status: {
            type: "string",
            enum: ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"],
          },
          customerId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.invoices.list(actor.organizationId, {
          search: str(args.search),
          status: str(args.status) as never,
          customerId: str(args.customerId),
          page: 1,
          limit: limitOf(args),
        } as never);

        const names = await this.customerNames(
          actor.organizationId,
          result.items.map((i) => i.customerId),
        );

        return {
          total: result.meta.total,
          items: result.items.map((i) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            status: i.status,
            customer: names.get(i.customerId) ?? null,
            totalAmount: i.totalAmount,
            balanceDue: i.balanceDue,
            dueDate: i.dueDate,
          })),
        };
      },
    };
  }

  private listNotifications(): AiTool {
    return {
      name: "list_notifications",
      description:
        "List the operational notifications visible to this user (delays, overdue invoices, expiring documents). " +
        "Use this to answer 'what needs my attention'.",
      allowedRoles: ALL_STAFF,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          unreadOnly: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        // NotificationsService takes the role explicitly and filters by
        // category itself — the Copilot inherits that filtering rather than
        // reimplementing it.
        const result = await this.notifications.list(actor.organizationId, actor.role, {
          unreadOnly: args.unreadOnly === true,
          page: 1,
          limit: limitOf(args),
        } as never);
        return {
          total: result.meta.total,
          items: result.items.map((n) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            severity: n.severity,
            category: n.category,
            readAt: n.readAt,
          })),
        };
      },
    };
  }

  private importStatus(): AiTool {
    return {
      name: "import_status",
      description:
        "List recent bulk-import sessions and their outcome (imported / failed / skipped counts). " +
        "Use this to answer 'did my customer import work'.",
      allowedRoles: ADMIN_OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          entityType: {
            type: "string",
            enum: ["Customer", "Order", "Driver", "Vehicle", "Expense"],
          },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
      handler: async (args, actor) => {
        const result = await this.imports.listSessions(actor.organizationId, {
          entityType: str(args.entityType),
          page: 1,
          limit: limitOf(args),
        });
        return {
          total: result.meta.total,
          items: result.items.map((s) => ({
            id: s.id,
            fileName: s.fileName,
            entityType: s.entityType,
            status: s.status,
            totalRows: s.totalRows,
            imported: s.successfulRows,
            updated: s.updatedRows,
            failed: s.failedRows,
            skipped: s.skippedRows,
            createdAt: s.createdAt,
          })),
        };
      },
    };
  }
}

/// The model emits JSON, so an argument is `unknown` until proven otherwise.
/// A blind cast would let a number or object reach a service expecting a
/// string.
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function limitOf(args: Record<string, unknown>): number {
  const raw = args.limit;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(raw), 1), 25);
}

export { ALL_STAFF, OPS, FINANCE, ADMIN_OPS, PAGE_SIZE, str, limitOf };
