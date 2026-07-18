import { Injectable } from "@nestjs/common";
import { CustomersService } from "../../customers/customers.service";
import { OrdersService } from "../../orders/orders.service";
import { WorkflowsService } from "../../workflows/workflows.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { ToolExecutionError, type AiTool } from "./tool.interface";
import { ADMIN_OPS, OPS, str } from "./read.tools";

/// Tools that change data.
///
/// Every one of these calls the SAME service method the HTTP API calls — not a
/// parallel write path. That is the whole point: order creation still runs its
/// transaction, still writes its OrderStatusHistory row (ADR-001), still emits
/// its domain event, and still audits. A "Copilot version" of create() that
/// skipped any of that would be a second source of truth, and the two would
/// drift the first time a business rule changed.
///
/// They are also the reason ToolExecutor re-checks roles at execution time: a
/// read that leaks is bad, a write that should not have happened is worse.
@Injectable()
export class WriteTools {
  constructor(
    private readonly customers: CustomersService,
    private readonly orders: OrdersService,
    private readonly workflows: WorkflowsService,
    private readonly notifications: NotificationsService,
  ) {}

  all(): AiTool[] {
    return [
      this.createCustomer(),
      this.createOrder(),
      this.assignDriver(),
      this.createWorkflow(),
    ];
  }

  private createCustomer(): AiTool {
    return {
      name: "create_customer",
      description:
        "Create a new customer. Only call this after confirming with the user that the customer does not " +
        "already exist — search_customers first. The customer code is generated automatically if omitted.",
      allowedRoles: ["ADMIN", "OPERATIONS_MANAGER", "SALES_CRM_MANAGER"],
      mutating: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["companyName", "contactName"],
        properties: {
          companyName: { type: "string", description: "Legal or trading name." },
          contactName: { type: "string", description: "Primary contact person." },
          email: { type: "string" },
          phone: { type: "string" },
          city: { type: "string" },
          country: { type: "string" },
          address: { type: "string" },
        },
      },
      handler: async (args, actor) => {
        const companyName = requireStr(args.companyName, "companyName");
        const contactName = requireStr(args.contactName, "contactName");

        const created = await this.customers.create(
          actor.organizationId,
          {
            companyName,
            contactName,
            email: str(args.email),
            phone: str(args.phone),
            city: str(args.city),
            country: str(args.country),
            address: str(args.address),
          } as never,
          actor,
        );
        return {
          id: created.id,
          customerCode: created.customerCode,
          companyName: created.companyName,
          created: true,
        };
      },
    };
  }

  private createOrder(): AiTool {
    return {
      name: "create_order",
      description:
        "Create a new order for an existing customer. Resolve the customer with search_customers first and pass " +
        "its UUID. Dates must be ISO (YYYY-MM-DD). The order is created as DRAFT; assign a driver separately.",
      allowedRoles: ADMIN_OPS,
      mutating: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "customerId", "pickupAddress", "pickupCity", "pickupDate",
          "deliveryAddress", "deliveryCity", "deliveryDate", "cargoDescription", "price",
        ],
        properties: {
          customerId: { type: "string", description: "Customer UUID from search_customers." },
          pickupAddress: { type: "string" },
          pickupCity: { type: "string" },
          pickupDate: { type: "string", description: "ISO date, e.g. 2026-08-01." },
          deliveryAddress: { type: "string" },
          deliveryCity: { type: "string" },
          deliveryDate: { type: "string", description: "ISO date; must be on or after pickupDate." },
          cargoDescription: { type: "string" },
          price: { type: "number", minimum: 0 },
          currency: { type: "string", description: "ISO code; defaults to the organization's currency." },
          notes: { type: "string" },
        },
      },
      handler: async (args, actor) => {
        const created = await this.orders.create(
          actor.organizationId,
          {
            customerId: requireStr(args.customerId, "customerId"),
            pickupAddress: requireStr(args.pickupAddress, "pickupAddress"),
            pickupCity: requireStr(args.pickupCity, "pickupCity"),
            pickupDate: requireIsoDate(args.pickupDate, "pickupDate"),
            deliveryAddress: requireStr(args.deliveryAddress, "deliveryAddress"),
            deliveryCity: requireStr(args.deliveryCity, "deliveryCity"),
            deliveryDate: requireIsoDate(args.deliveryDate, "deliveryDate"),
            cargoDescription: requireStr(args.cargoDescription, "cargoDescription"),
            price: requireNumber(args.price, "price"),
            currency: str(args.currency),
            notes: str(args.notes),
          } as never,
          actor,
        );
        return {
          id: created.id,
          orderNumber: created.orderNumber,
          status: created.status,
          created: true,
        };
      },
    };
  }

  private assignDriver(): AiTool {
    return {
      name: "assign_driver",
      description:
        "Assign a driver (and optionally a vehicle) to an order. Resolve both with search_orders and " +
        "search_drivers first. This creates the dispatch and moves the order to ASSIGNED. It will be refused " +
        "if the driver or vehicle is already committed elsewhere in that window.",
      allowedRoles: OPS,
      mutating: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["orderId", "driverId"],
        properties: {
          orderId: { type: "string", description: "Order UUID from search_orders." },
          driverId: { type: "string", description: "Driver UUID from search_drivers." },
          vehicleId: { type: "string", description: "Optional vehicle UUID from search_vehicles." },
        },
      },
      handler: async (args, actor) => {
        // OrdersService.assign runs the real AssignmentPolicy — overlap and
        // capacity rules included. A conflict surfaces as a ConflictException,
        // which ToolExecutor turns into a message the model relays.
        const result = await this.orders.assign(
          actor.organizationId,
          requireStr(args.orderId, "orderId"),
          {
            driverId: requireStr(args.driverId, "driverId"),
            vehicleId: str(args.vehicleId),
          } as never,
          actor,
        );
        return {
          id: result.id,
          orderNumber: result.orderNumber,
          status: result.status,
          assigned: true,
        };
      },
    };
  }

  private createWorkflow(): AiTool {
    return {
      name: "create_workflow",
      description:
        "Create an automation workflow. The workflow is created as a DRAFT and is NOT active — tell the user " +
        "they must review and publish it. Use the trigger event names exactly as listed in the enum.",
      allowedRoles: ADMIN_OPS,
      mutating: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["name", "triggerEvent", "actions"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          triggerEvent: {
            type: "string",
            enum: [
              "order.created", "order.updated", "order.status_changed", "order.cancelled",
              "dispatch.created", "dispatch.status_changed", "dispatch.completed",
              "invoice.created", "invoice.paid", "payment.received",
              "customer.created", "customer.updated", "driver.created",
              "vehicle.created", "expense.created", "expense.approved",
            ],
          },
          actions: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            description: "Ordered actions to run when the trigger fires.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type"],
              properties: {
                type: {
                  type: "string",
                  enum: ["send_notification", "send_email", "log", "flag_for_review"],
                },
                title: { type: "string" },
                message: { type: "string" },
                to: { type: "string", description: "Recipient, for send_email." },
                subject: { type: "string", description: "Subject, for send_email." },
              },
            },
          },
        },
      },
      handler: async (args, actor) => {
        const actions = args.actions;
        if (!Array.isArray(actions) || actions.length === 0) {
          throw new ToolExecutionError("actions must be a non-empty array");
        }

        const created = await this.workflows.create(
          actor.organizationId,
          actor.userId,
          {
            name: requireStr(args.name, "name"),
            description: str(args.description),
            config: {
              trigger: { event: requireStr(args.triggerEvent, "triggerEvent") },
              actions: actions.map((action) => {
                const a = action as Record<string, unknown>;
                return {
                  type: requireStr(a.type, "action.type"),
                  config: {
                    ...(str(a.title) ? { title: str(a.title) } : {}),
                    ...(str(a.message) ? { message: str(a.message) } : {}),
                    ...(str(a.to) ? { to: str(a.to) } : {}),
                    ...(str(a.subject) ? { subject: str(a.subject) } : {}),
                  },
                };
              }),
            },
            // Never active on creation. An AI that silently switches on
            // automation which emails customers is not a feature.
            active: false,
          } as never,
        );
        return {
          id: created.id,
          name: created.name,
          status: created.status,
          active: created.active,
          created: true,
          note: "Created as an inactive draft. Review and publish it before it will run.",
        };
      },
    };
  }
}

/// The model produces JSON, and a required field can still arrive as null, a
/// number, or absent entirely. These turn that into a message the model can
/// read and correct on its next turn, rather than a type error deep in a
/// service.
function requireStr(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolExecutionError(`${field} is required and must be a non-empty string`);
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Models routinely emit "1500.00" for a number field.
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new ToolExecutionError(`${field} is required and must be a number`);
}

function requireIsoDate(value: unknown, field: string): string {
  const text = requireStr(value, field);
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(text)) {
    throw new ToolExecutionError(`${field} must be an ISO date (YYYY-MM-DD), got "${text}"`);
  }
  const parsed = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ToolExecutionError(`${field} is not a real date: "${text}"`);
  }
  return parsed.toISOString();
}
