import { Injectable } from "@nestjs/common";
import { ReportsService } from "../../reports/reports.service";
import { FinanceService } from "../../finance/finance.service";
import { UsageService } from "../../developer/usage/usage.service";
import { PrismaService } from "../../prisma/prisma.service";
import type { AiTool } from "./tool.interface";
import { ADMIN_OPS, ALL_STAFF, FINANCE, OPS } from "./read.tools";

/// Analytical tools.
///
/// Every number here is computed by the SAME service that backs the Reports and
/// Finance screens. That is deliberate and load-bearing: if the Copilot said
/// revenue was 1.2M and the Reports page said 1.4M, the Copilot would be worse
/// than useless — a plausible second number nobody can reconcile. There is one
/// source of truth per figure, and the AI reads it rather than deriving its own.
///
/// It is also why there is no "estimate" or "approximate" anywhere in this file.
@Injectable()
export class AnalyticsTools {
  constructor(
    private readonly reports: ReportsService,
    private readonly finance: FinanceService,
    private readonly usage: UsageService,
    private readonly prisma: PrismaService,
  ) {}

  all(): AiTool[] {
    return [
      this.financeSummary(),
      this.executiveReport(),
      this.dashboardSummary(),
      this.fleetUtilization(),
      this.apiUsage(),
    ];
  }

  private financeSummary(): AiTool {
    return {
      name: "finance_summary",
      description:
        "Organization-wide finance totals: revenue, outstanding and overdue receivables, expenses, margin. " +
        "Use this for 'how are we doing financially' or any question about money owed to us.",
      allowedRoles: FINANCE,
      mutating: false,
      parameters: { type: "object", additionalProperties: false, properties: {} },
      handler: async (_args, actor) => this.finance.summary(actor.organizationId),
    };
  }

  private executiveReport(): AiTool {
    return {
      name: "generate_report",
      description:
        "Generate the executive overview for a date range: revenue over time, orders by status, top customers, " +
        "delivery performance. Use this for 'this month's revenue report' or trend questions. " +
        "Dates are ISO (YYYY-MM-DD); omit them for the default recent window.",
      allowedRoles: ["ADMIN", "OPERATIONS_MANAGER", "ACCOUNTANT"],
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          startDate: { type: "string", description: "ISO date, inclusive." },
          endDate: { type: "string", description: "ISO date, inclusive." },
        },
      },
      handler: async (args, actor) => {
        const report = await this.reports.executiveOverview(actor.organizationId, {
          startDate: typeof args.startDate === "string" ? args.startDate : undefined,
          endDate: typeof args.endDate === "string" ? args.endDate : undefined,
        } as never);
        return report;
      },
    };
  }

  private dashboardSummary(): AiTool {
    return {
      name: "dashboard_summary",
      description:
        "Today's operational picture: order counts by status, active dispatches, available drivers and vehicles. " +
        "Use this to answer 'summarise today' or 'what's the state of the board'.",
      allowedRoles: ALL_STAFF,
      mutating: false,
      parameters: { type: "object", additionalProperties: false, properties: {} },
      handler: async (_args, actor) => {
        const organizationId = actor.organizationId;

        // Grouped counts rather than N queries — this is one round trip per
        // dimension regardless of how many statuses exist.
        const [ordersByStatus, dispatchesByStatus, driversByStatus, vehiclesByStatus] =
          await Promise.all([
            this.prisma.order.groupBy({
              by: ["status"], where: { organizationId }, _count: { _all: true },
            }),
            this.prisma.dispatch.groupBy({
              by: ["status"], where: { organizationId }, _count: { _all: true },
            }),
            this.prisma.driver.groupBy({
              by: ["status"], where: { organizationId, archivedAt: null }, _count: { _all: true },
            }),
            this.prisma.vehicle.groupBy({
              by: ["status"], where: { organizationId, archivedAt: null }, _count: { _all: true },
            }),
          ]);

        const tally = (rows: Array<{ status: string; _count: { _all: number } }>) =>
          Object.fromEntries(rows.map((r) => [r.status, r._count._all]));

        return {
          orders: tally(ordersByStatus),
          dispatches: tally(dispatchesByStatus),
          drivers: tally(driversByStatus),
          vehicles: tally(vehiclesByStatus),
        };
      },
    };
  }

  private fleetUtilization(): AiTool {
    return {
      name: "fleet_utilization",
      description:
        "Driver workload and vehicle utilization over a period: how many dispatches each driver and vehicle " +
        "handled. Use this for 'who is overloaded', 'which vehicles are underused', or workload balance questions.",
      allowedRoles: OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          days: {
            type: "integer", minimum: 1, maximum: 365,
            description: "Look-back window in days (default 30).",
          },
        },
      },
      handler: async (args, actor) => {
        const days = typeof args.days === "number" && Number.isFinite(args.days)
          ? Math.min(Math.max(Math.trunc(args.days), 1), 365)
          : 30;
        const since = new Date(Date.now() - days * 86_400_000);
        const organizationId = actor.organizationId;

        // No `driverId: { not: null }` filter: under ADR-001 a Dispatch IS the
        // assignment, so driverId and vehicleId are non-nullable columns. There
        // is no unassigned dispatch to exclude.
        const [byDriver, byVehicle] = await Promise.all([
          this.prisma.dispatch.groupBy({
            by: ["driverId"],
            where: { organizationId, createdAt: { gte: since } },
            _count: true,
          }),
          this.prisma.dispatch.groupBy({
            by: ["vehicleId"],
            where: { organizationId, createdAt: { gte: since } },
            _count: true,
          }),
        ]);

        // Names are resolved in ONE query per dimension, not one per group —
        // the difference between 2 queries and 2N.
        const driverIds = byDriver.map((d) => d.driverId);
        const vehicleIds = byVehicle.map((v) => v.vehicleId);

        const [drivers, vehicles] = await Promise.all([
          driverIds.length
            ? this.prisma.driver.findMany({
                where: { id: { in: driverIds }, organizationId },
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
              })
            : Promise.resolve([]),
          vehicleIds.length
            ? this.prisma.vehicle.findMany({
                where: { id: { in: vehicleIds }, organizationId },
                select: { id: true, plateNumber: true, vehicleCode: true },
              })
            : Promise.resolve([]),
        ]);

        const driverById = new Map(drivers.map((d) => [d.id, d]));
        const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

        return {
          windowDays: days,
          drivers: byDriver
            .map((row) => {
              const driver = driverById.get(row.driverId);
              return {
                employeeCode: driver?.employeeCode ?? null,
                // A driver archived since the dispatch still has dispatches to
                // their name; saying "(removed)" is more honest than dropping
                // the row and under-reporting the period's workload.
                name: driver ? `${driver.firstName} ${driver.lastName}` : "(removed driver)",
                dispatches: row._count,
              };
            })
            .sort((a, b) => b.dispatches - a.dispatches),
          vehicles: byVehicle
            .map((row) => {
              const vehicle = vehicleById.get(row.vehicleId);
              return {
                vehicleCode: vehicle?.vehicleCode ?? null,
                plateNumber: vehicle?.plateNumber ?? "(removed vehicle)",
                dispatches: row._count,
              };
            })
            .sort((a, b) => b.dispatches - a.dispatches),
        };
      },
    };
  }

  private apiUsage(): AiTool {
    return {
      name: "developer_api_usage",
      description:
        "Third-party API usage for this organization: call volume, success rate, latency, webhook delivery health. " +
        "Use this for questions about integrations or API consumption.",
      // Developer Portal data is admin-level, matching UsageController. A
      // SALES_CRM_MANAGER asking about API keys is told the tool does not exist.
      allowedRoles: ADMIN_OPS,
      mutating: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          startDate: { type: "string", description: "ISO date (YYYY-MM-DD)." },
          endDate: { type: "string", description: "ISO date (YYYY-MM-DD)." },
        },
      },
      handler: async (args, actor) => {
        const stats = await this.usage.getStats(
          actor.organizationId,
          typeof args.startDate === "string" ? args.startDate : undefined,
          typeof args.endDate === "string" ? args.endDate : undefined,
        );
        // endpointBreakdown can be large and is mostly noise to a model
        // answering "how are the integrations doing" — the top few carry the
        // signal, and the rest is token budget spent on nothing.
        const topEndpoints = Object.entries(stats.endpointBreakdown)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);

        return {
          totalCalls: stats.totalCalls,
          successRate: stats.successRate,
          failureCount: stats.failureCount,
          avgLatencyMs: stats.avgLatencyMs,
          statusBreakdown: stats.statusBreakdown,
          topEndpoints: Object.fromEntries(topEndpoints),
          webhookDeliveries: stats.webhookDeliveries,
          lastActivityAt: stats.lastActivityAt,
        };
      },
    };
  }
}
