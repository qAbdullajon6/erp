import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { toCsv, reportCsvFilename } from "./csv.util";
import { ExportReportQueryDto } from "./dto/export-report-query.dto";
import { ReportFilterDto } from "./dto/report-filter.dto";
import {
  bucketKeyFor,
  buildExceptionOrderWhere,
  buildExpenseWhere,
  buildInvoiceWhere,
  buildOrderWhere,
  DateRange,
  enumerateBuckets,
  percentChange,
  resolveBucketGranularity,
  resolveReportFilter,
  ResolvedReportFilter,
} from "./report-filters.util";

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_ORDER_STATUSES = ["PENDING", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"];
const AGING_BUCKET_KEYS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
type AgingBucketKey = (typeof AGING_BUCKET_KEYS)[number];

interface OrderProfitabilityRow {
  orderId: string;
  orderNumber: string;
  customerId: string;
  driverId: string | null;
  vehicleId: string | null;
  pickupCity: string;
  deliveryCity: string;
  currency: string;
  revenue: Prisma.Decimal;
  approvedExpenses: Prisma.Decimal;
  estimatedGrossProfit: Prisma.Decimal;
}

interface CoreMetrics {
  totalOrders: number;
  deliveredOrders: number;
  activeOrders: number;
  delayedOrders: number;
  totalRevenue: Prisma.Decimal;
  approvedExpenses: Prisma.Decimal;
  estimatedGrossProfit: Prisma.Decimal;
  totalInvoiced: Prisma.Decimal;
  totalCollected: Prisma.Decimal;
  outstandingReceivables: Prisma.Decimal;
  deliveryCompletionRate: number;
  onTimeDeliveryRate: number;
}

function toOrderExceptionRow(order: {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  pickupCity: string;
  deliveryCity: string;
  deliveryDate: Date;
  price: Prisma.Decimal;
  currency: string;
}) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    status: order.status,
    pickupCity: order.pickupCity,
    deliveryCity: order.deliveryCity,
    deliveryDate: order.deliveryDate,
    price: order.price.toString(),
    currency: order.currency,
  };
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveFilter(organizationId: string, dto: ReportFilterDto): Promise<ResolvedReportFilter> {
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return resolveReportFilter(dto, organization.timezone);
  }

  // -----------------------------------------------------------------------
  // Executive Overview
  // -----------------------------------------------------------------------

  async executiveOverview(organizationId: string, dto: ReportFilterDto) {
    const filter = await this.resolveFilter(organizationId, dto);
    const current = await this.computeCoreMetrics(organizationId, filter, filter.range);
    const comparison = filter.comparisonRange
      ? this.buildComparison(current, await this.computeCoreMetrics(organizationId, filter, filter.comparisonRange))
      : null;
    const timeSeries = await this.computeTimeSeries(organizationId, filter);
    const ordersByStatus = await this.computeOrdersByStatus(organizationId, filter);
    const topCustomers = await this.computeTopCustomers(organizationId, filter);
    const topRoutes = await this.computeTopRoutes(organizationId, filter);

    return {
      filters: this.filtersToResponse(filter, dto),
      totals: this.coreMetricsToResponse(current),
      comparison,
      revenueVsExpensesTimeSeries: timeSeries.revenueVsExpenses,
      deliveryPerformanceTimeSeries: timeSeries.deliveryPerformance,
      ordersByStatus,
      topCustomers,
      topRoutes,
    };
  }

  /// "delivered/active/delayed" are always computed against their own fixed
  /// status regardless of an `orderStatus` filter — an explicit
  /// orderStatus filter narrows `totalOrders` and the exception/breakdown
  /// lists, but doesn't make "delivered orders" mean something else.
  private async computeCoreMetrics(
    organizationId: string,
    filter: ResolvedReportFilter,
    range: DateRange,
  ): Promise<CoreMetrics> {
    const orderWhere = buildOrderWhere(organizationId, filter, range);
    const invoiceWhere = buildInvoiceWhere(organizationId, filter, range);
    const expenseWhere = buildExpenseWhere(organizationId, filter, range);

    const [totalOrders, activeOrders, orderRows, revenueAgg, expenseAgg, invoiceAgg] = await Promise.all([
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.count({ where: { ...orderWhere, status: { in: ACTIVE_ORDER_STATUSES as never } } }),
      this.prisma.order.findMany({
        where: orderWhere,
        select: { status: true, deliveryDate: true, deliveredAt: true },
      }),
      this.prisma.order.aggregate({ where: { ...orderWhere, status: "DELIVERED" }, _sum: { price: true } }),
      this.prisma.expense.aggregate({ where: { ...expenseWhere, status: "APPROVED" }, _sum: { amount: true } }),
      this.prisma.invoice.aggregate({
        where: { ...invoiceWhere, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
      }),
    ]);

    const now = new Date();
    const deliveredRows = orderRows.filter((o) => o.status === "DELIVERED");
    const delayedOrders = orderRows.filter(
      (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED" && o.deliveryDate < now,
    ).length;
    const deliveredWithTimestamp = deliveredRows.filter((o) => o.deliveredAt);
    const onTimeCount = deliveredWithTimestamp.filter((o) => o.deliveredAt! <= o.deliveryDate).length;

    const totalRevenue = revenueAgg._sum.price ?? ZERO;
    const approvedExpenses = expenseAgg._sum.amount ?? ZERO;

    return {
      totalOrders,
      deliveredOrders: deliveredRows.length,
      activeOrders,
      delayedOrders,
      totalRevenue,
      approvedExpenses,
      estimatedGrossProfit: totalRevenue.sub(approvedExpenses),
      totalInvoiced: invoiceAgg._sum.totalAmount ?? ZERO,
      totalCollected: invoiceAgg._sum.paidAmount ?? ZERO,
      outstandingReceivables: invoiceAgg._sum.balanceDue ?? ZERO,
      deliveryCompletionRate: totalOrders > 0 ? (deliveredRows.length / totalOrders) * 100 : 0,
      onTimeDeliveryRate: deliveredWithTimestamp.length > 0 ? (onTimeCount / deliveredWithTimestamp.length) * 100 : 0,
    };
  }

  private buildComparison(current: CoreMetrics, previous: CoreMetrics) {
    const num = (d: Prisma.Decimal) => Number(d.toString());
    const pair = (c: number, p: number) => ({ current: c, previous: p, changePercent: percentChange(c, p) });

    return {
      totalOrders: pair(current.totalOrders, previous.totalOrders),
      deliveredOrders: pair(current.deliveredOrders, previous.deliveredOrders),
      totalRevenue: pair(num(current.totalRevenue), num(previous.totalRevenue)),
      approvedExpenses: pair(num(current.approvedExpenses), num(previous.approvedExpenses)),
      estimatedGrossProfit: pair(num(current.estimatedGrossProfit), num(previous.estimatedGrossProfit)),
      totalInvoiced: pair(num(current.totalInvoiced), num(previous.totalInvoiced)),
      totalCollected: pair(num(current.totalCollected), num(previous.totalCollected)),
      deliveryCompletionRate: pair(current.deliveryCompletionRate, previous.deliveryCompletionRate),
      onTimeDeliveryRate: pair(current.onTimeDeliveryRate, previous.onTimeDeliveryRate),
    };
  }

  private coreMetricsToResponse(metrics: CoreMetrics) {
    return {
      totalOrders: metrics.totalOrders,
      deliveredOrders: metrics.deliveredOrders,
      activeOrders: metrics.activeOrders,
      delayedOrders: metrics.delayedOrders,
      totalRevenue: metrics.totalRevenue.toString(),
      approvedExpenses: metrics.approvedExpenses.toString(),
      estimatedGrossProfit: metrics.estimatedGrossProfit.toString(),
      totalInvoiced: metrics.totalInvoiced.toString(),
      totalCollected: metrics.totalCollected.toString(),
      outstandingReceivables: metrics.outstandingReceivables.toString(),
      deliveryCompletionRate: metrics.deliveryCompletionRate,
      onTimeDeliveryRate: metrics.onTimeDeliveryRate,
    };
  }

  private async computeTimeSeries(organizationId: string, filter: ResolvedReportFilter) {
    const range = filter.range;
    const granularity = resolveBucketGranularity(range);
    const bucketKeys = enumerateBuckets(range, granularity, filter.timezone);

    const orderWhere = buildOrderWhere(organizationId, filter, range);
    const expenseWhere = buildExpenseWhere(organizationId, filter, range);

    const [orders, expenses] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
        select: { status: true, price: true, deliveryDate: true },
      }),
      this.prisma.expense.findMany({
        where: { ...expenseWhere, status: "APPROVED" },
        select: { amount: true, expenseDate: true },
      }),
    ]);

    const revenueByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]));
    const expensesByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]));
    const deliveredByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]));
    const delayedByBucket = new Map<string, number>(bucketKeys.map((k) => [k, 0]));
    const now = new Date();

    for (const order of orders) {
      const key = bucketKeyFor(order.deliveryDate, granularity, filter.timezone);
      if (order.status === "DELIVERED") {
        revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + Number(order.price));
        deliveredByBucket.set(key, (deliveredByBucket.get(key) ?? 0) + 1);
      } else if (order.status !== "CANCELLED" && order.deliveryDate < now) {
        delayedByBucket.set(key, (delayedByBucket.get(key) ?? 0) + 1);
      }
    }
    for (const expense of expenses) {
      const key = bucketKeyFor(expense.expenseDate, granularity, filter.timezone);
      expensesByBucket.set(key, (expensesByBucket.get(key) ?? 0) + Number(expense.amount));
    }

    return {
      revenueVsExpenses: bucketKeys.map((key) => ({
        bucket: key,
        revenue: revenueByBucket.get(key) ?? 0,
        expenses: expensesByBucket.get(key) ?? 0,
      })),
      deliveryPerformance: bucketKeys.map((key) => ({
        bucket: key,
        delivered: deliveredByBucket.get(key) ?? 0,
        delayed: delayedByBucket.get(key) ?? 0,
      })),
    };
  }

  private async computeOrdersByStatus(organizationId: string, filter: ResolvedReportFilter) {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const groups = await this.prisma.order.groupBy({
      by: ["status"],
      where: orderWhere,
      _count: { _all: true },
    });
    return groups.map((g) => ({ status: g.status, count: g._count._all }));
  }

  private async computeTopCustomers(organizationId: string, filter: ResolvedReportFilter, take = 5) {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const grouped = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: { ...orderWhere, status: "DELIVERED" },
      _sum: { price: true },
      _count: { _all: true },
      orderBy: { _sum: { price: "desc" } },
      take,
    });
    if (grouped.length === 0) return [];

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
      select: { id: true, companyName: true },
    });
    const nameById = new Map(customers.map((c) => [c.id, c.companyName]));

    return grouped.map((g) => ({
      customerId: g.customerId,
      companyName: nameById.get(g.customerId) ?? "Unknown",
      revenue: (g._sum.price ?? ZERO).toString(),
      orderCount: g._count._all,
    }));
  }

  private async computeTopRoutes(organizationId: string, filter: ResolvedReportFilter, take = 5) {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const grouped = await this.prisma.order.groupBy({
      by: ["pickupCity", "deliveryCity"],
      where: { ...orderWhere, status: "DELIVERED" },
      _sum: { price: true },
      _count: { _all: true },
      orderBy: { _sum: { price: "desc" } },
      take,
    });
    return grouped.map((g) => ({
      pickupCity: g.pickupCity,
      deliveryCity: g.deliveryCity,
      revenue: (g._sum.price ?? ZERO).toString(),
      orderCount: g._count._all,
    }));
  }

  // -----------------------------------------------------------------------
  // Operations
  // -----------------------------------------------------------------------

  async operations(organizationId: string, dto: ReportFilterDto) {
    const filter = await this.resolveFilter(organizationId, dto);
    const [driverPerformance, vehiclePerformance, routePerformance, exceptions] = await Promise.all([
      this.computeDriverPerformance(organizationId, filter),
      this.computeVehiclePerformance(organizationId, filter),
      this.computeRoutePerformance(organizationId, filter),
      this.computeExceptions(organizationId, filter),
    ]);

    return {
      filters: this.filtersToResponse(filter, dto),
      driverPerformance,
      vehiclePerformance,
      routePerformance,
      exceptions,
    };
  }

  private async computeDriverPerformance(organizationId: string, filter: ResolvedReportFilter) {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const orders = await this.prisma.order.findMany({
      where: { ...orderWhere, driverId: { not: null } },
      select: { driverId: true, status: true, deliveryDate: true, deliveredAt: true, price: true },
    });
    if (orders.length === 0) return [];

    const now = new Date();
    const byDriver = new Map<
      string,
      { total: number; delivered: number; onTime: number; delayed: number; revenue: Prisma.Decimal }
    >();
    for (const order of orders) {
      const driverId = order.driverId!;
      const stats = byDriver.get(driverId) ?? { total: 0, delivered: 0, onTime: 0, delayed: 0, revenue: ZERO };
      stats.total += 1;
      if (order.status === "DELIVERED") {
        stats.delivered += 1;
        stats.revenue = stats.revenue.add(order.price);
        if (order.deliveredAt && order.deliveredAt <= order.deliveryDate) stats.onTime += 1;
      } else if (order.status !== "CANCELLED" && order.deliveryDate < now) {
        stats.delayed += 1;
      }
      byDriver.set(driverId, stats);
    }

    const drivers = await this.prisma.driver.findMany({
      where: { id: { in: [...byDriver.keys()] } },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });

    return drivers
      .map((driver) => {
        const stats = byDriver.get(driver.id)!;
        return {
          driverId: driver.id,
          employeeCode: driver.employeeCode,
          name: `${driver.firstName} ${driver.lastName}`,
          totalOrders: stats.total,
          deliveredOrders: stats.delivered,
          onTimeRate: stats.delivered > 0 ? (stats.onTime / stats.delivered) * 100 : 0,
          delayedOrders: stats.delayed,
          revenue: stats.revenue.toString(),
        };
      })
      .sort((a, b) => b.onTimeRate - a.onTimeRate);
  }

  /// "Utilization" here is a simple order-count/revenue/expense proxy, not
  /// a true day-by-day occupancy percentage (which would need tracking
  /// vehicle availability windows independent of orders — out of scope for
  /// this phase).
  private async computeVehiclePerformance(organizationId: string, filter: ResolvedReportFilter) {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const expenseWhere = buildExpenseWhere(organizationId, filter, filter.range);

    const [orders, expenseAgg] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...orderWhere, vehicleId: { not: null } },
        select: { vehicleId: true, status: true, price: true },
      }),
      this.prisma.expense.groupBy({
        by: ["vehicleId"],
        where: { ...expenseWhere, status: "APPROVED", vehicleId: { not: null } },
        _sum: { amount: true },
      }),
    ]);
    if (orders.length === 0) return [];

    const expensesByVehicle = new Map(expenseAgg.map((e) => [e.vehicleId as string, e._sum.amount ?? ZERO]));
    const byVehicle = new Map<string, { total: number; delivered: number; revenue: Prisma.Decimal }>();
    for (const order of orders) {
      const vehicleId = order.vehicleId!;
      const stats = byVehicle.get(vehicleId) ?? { total: 0, delivered: 0, revenue: ZERO };
      stats.total += 1;
      if (order.status === "DELIVERED") {
        stats.delivered += 1;
        stats.revenue = stats.revenue.add(order.price);
      }
      byVehicle.set(vehicleId, stats);
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: [...byVehicle.keys()] } },
      select: { id: true, vehicleCode: true, plateNumber: true },
    });

    return vehicles
      .map((vehicle) => {
        const stats = byVehicle.get(vehicle.id)!;
        const expenses = expensesByVehicle.get(vehicle.id) ?? ZERO;
        return {
          vehicleId: vehicle.id,
          vehicleCode: vehicle.vehicleCode,
          plateNumber: vehicle.plateNumber,
          totalOrders: stats.total,
          deliveredOrders: stats.delivered,
          revenue: stats.revenue.toString(),
          approvedExpenses: expenses.toString(),
          estimatedGrossProfit: stats.revenue.sub(expenses).toString(),
        };
      })
      .sort((a, b) => Number(b.estimatedGrossProfit) - Number(a.estimatedGrossProfit));
  }

  private async computeRoutePerformance(organizationId: string, filter: ResolvedReportFilter) {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: { pickupCity: true, deliveryCity: true, status: true, price: true },
    });
    if (orders.length === 0) return [];

    const byRoute = new Map<string, { pickupCity: string; deliveryCity: string; total: number; delivered: number; revenue: Prisma.Decimal }>();
    for (const order of orders) {
      const key = `${order.pickupCity} ${order.deliveryCity}`;
      const stats = byRoute.get(key) ?? {
        pickupCity: order.pickupCity,
        deliveryCity: order.deliveryCity,
        total: 0,
        delivered: 0,
        revenue: ZERO,
      };
      stats.total += 1;
      if (order.status === "DELIVERED") {
        stats.delivered += 1;
        stats.revenue = stats.revenue.add(order.price);
      }
      byRoute.set(key, stats);
    }

    return [...byRoute.values()]
      .map((stats) => ({
        pickupCity: stats.pickupCity,
        deliveryCity: stats.deliveryCity,
        totalOrders: stats.total,
        deliveredOrders: stats.delivered,
        completionRate: stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0,
        revenue: stats.revenue.toString(),
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));
  }

  /// delayedOrders/unassignedActiveOrders reflect LIVE current state (no
  /// date-range clause — see buildExceptionOrderWhere); cancelledOrders/
  /// negativeProfitOrders/deliveredWithoutInvoice describe specific past
  /// events and are scoped to the report's selected date range instead.
  private async computeExceptions(organizationId: string, filter: ResolvedReportFilter) {
    const exceptionWhere = buildExceptionOrderWhere(organizationId, filter);
    const rangeWhere = buildOrderWhere(organizationId, filter, filter.range);
    const now = new Date();

    const exceptionSelect = {
      id: true,
      orderNumber: true,
      customerId: true,
      status: true,
      pickupCity: true,
      deliveryCity: true,
      deliveryDate: true,
      price: true,
      currency: true,
    } as const;

    const [delayed, unassigned, cancelled, deliveredInRange] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...exceptionWhere, status: { notIn: ["DELIVERED", "CANCELLED"] }, deliveryDate: { lt: now } },
        select: exceptionSelect,
      }),
      this.prisma.order.findMany({
        where: { ...exceptionWhere, status: "PENDING" },
        select: exceptionSelect,
      }),
      this.prisma.order.findMany({
        where: { ...rangeWhere, status: "CANCELLED" },
        select: exceptionSelect,
      }),
      this.prisma.order.findMany({
        where: { ...rangeWhere, status: "DELIVERED" },
        select: exceptionSelect,
      }),
    ]);

    const orderIds = deliveredInRange.map((o) => o.id);
    const [expenseAgg, invoicedOrders] = await Promise.all([
      orderIds.length > 0
        ? this.prisma.expense.groupBy({
            by: ["orderId"],
            where: { organizationId, status: "APPROVED", orderId: { in: orderIds } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      orderIds.length > 0
        ? this.prisma.invoice.findMany({
            where: { organizationId, orderId: { in: orderIds }, status: { not: "CANCELLED" } },
            select: { orderId: true },
          })
        : Promise.resolve([]),
    ]);
    const expenseByOrder = new Map(expenseAgg.map((e) => [e.orderId as string, e._sum.amount ?? ZERO]));
    const invoicedOrderIds = new Set(invoicedOrders.map((i) => i.orderId));

    const negativeProfitOrders = deliveredInRange
      .filter((o) => o.price.sub(expenseByOrder.get(o.id) ?? ZERO).lt(0))
      .map((o) => ({
        ...toOrderExceptionRow(o),
        approvedExpenses: (expenseByOrder.get(o.id) ?? ZERO).toString(),
        estimatedGrossProfit: o.price.sub(expenseByOrder.get(o.id) ?? ZERO).toString(),
      }));

    const deliveredWithoutInvoice = deliveredInRange.filter((o) => !invoicedOrderIds.has(o.id)).map(toOrderExceptionRow);

    return {
      delayedOrders: delayed.map(toOrderExceptionRow),
      unassignedActiveOrders: unassigned.map(toOrderExceptionRow),
      cancelledOrders: cancelled.map(toOrderExceptionRow),
      negativeProfitOrders,
      deliveredWithoutInvoice,
    };
  }

  // -----------------------------------------------------------------------
  // Financial
  // -----------------------------------------------------------------------

  async financial(organizationId: string, dto: ReportFilterDto) {
    const filter = await this.resolveFilter(organizationId, dto);
    const [receivablesAging, invoiceCollectionPerformance, expenseBreakdown, profitabilityRows] = await Promise.all([
      this.computeReceivablesAging(organizationId, filter),
      this.computeCollectionPerformance(organizationId, filter),
      this.computeExpenseBreakdown(organizationId, filter),
      this.computeOrderProfitability(organizationId, filter),
    ]);

    const customerIds = [...new Set(profitabilityRows.map((r) => r.customerId))];
    const driverIds = [...new Set(profitabilityRows.map((r) => r.driverId).filter((id): id is string => !!id))];
    const vehicleIds = [...new Set(profitabilityRows.map((r) => r.vehicleId).filter((id): id is string => !!id))];

    const [customers, drivers, vehicles] = await Promise.all([
      this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, companyName: true } }),
      this.prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plateNumber: true } }),
    ]);
    const customerName = new Map(customers.map((c) => [c.id, c.companyName]));
    const driverName = new Map(drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`]));
    const vehicleName = new Map(vehicles.map((v) => [v.id, v.plateNumber]));

    const byCustomer = this.groupProfitability(
      profitabilityRows,
      (r) => r.customerId,
      (r) => customerName.get(r.customerId) ?? "Unknown",
    );
    const byRoute = this.groupProfitability(
      profitabilityRows,
      (r) => `${r.pickupCity}->${r.deliveryCity}`,
      (r) => `${r.pickupCity} -> ${r.deliveryCity}`,
    );
    const byDriver = this.groupProfitability(
      profitabilityRows.filter((r) => r.driverId),
      (r) => r.driverId!,
      (r) => driverName.get(r.driverId!) ?? "Unknown",
    );
    const byVehicle = this.groupProfitability(
      profitabilityRows.filter((r) => r.vehicleId),
      (r) => r.vehicleId!,
      (r) => vehicleName.get(r.vehicleId!) ?? "Unknown",
    );
    const byOrder = profitabilityRows
      .map((r) => ({
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        currency: r.currency,
        revenue: r.revenue.toString(),
        approvedExpenses: r.approvedExpenses.toString(),
        estimatedGrossProfit: r.estimatedGrossProfit.toString(),
      }))
      .sort((a, b) => Number(a.estimatedGrossProfit) - Number(b.estimatedGrossProfit));

    return {
      filters: this.filtersToResponse(filter, dto),
      receivablesAging,
      invoiceCollectionPerformance,
      expenseBreakdown,
      /// Profitability is always an ESTIMATE (revenue minus only APPROVED
      /// expenses; no COGS/overhead/tax modeling) — labelled explicitly so
      /// it's never mistaken for audited accounting.
      profitability: { label: "Estimated Gross Profit", byCustomer, byRoute, byDriver, byVehicle, byOrder },
    };
  }

  /// Receivables aging is a point-in-time snapshot of currently-outstanding
  /// balances — deliberately NOT scoped by the report's date-range filter
  /// (an invoice issued 6 months ago that's still unpaid is exactly what
  /// aging exists to surface), though customerId/currency filters still
  /// apply.
  private async computeReceivablesAging(organizationId: string, filter: ResolvedReportFilter) {
    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      status: { notIn: ["PAID", "CANCELLED"] },
      balanceDue: { gt: 0 },
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
    };
    const invoices = await this.prisma.invoice.findMany({ where, select: { balanceDue: true, dueDate: true } });

    const now = new Date();
    const amounts: Record<AgingBucketKey, Prisma.Decimal> = {
      current: ZERO,
      "1-30": ZERO,
      "31-60": ZERO,
      "61-90": ZERO,
      "90+": ZERO,
    };
    const counts: Record<AgingBucketKey, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

    for (const invoice of invoices) {
      let bucket: AgingBucketKey = "current";
      if (invoice.dueDate && invoice.dueDate < now) {
        const daysPastDue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / DAY_MS);
        if (daysPastDue <= 30) bucket = "1-30";
        else if (daysPastDue <= 60) bucket = "31-60";
        else if (daysPastDue <= 90) bucket = "61-90";
        else bucket = "90+";
      }
      amounts[bucket] = amounts[bucket].add(invoice.balanceDue);
      counts[bucket] += 1;
    }

    return AGING_BUCKET_KEYS.map((bucket) => ({
      bucket,
      amount: amounts[bucket].toString(),
      invoiceCount: counts[bucket],
    }));
  }

  private async computeCollectionPerformance(organizationId: string, filter: ResolvedReportFilter) {
    const invoiceWhere = buildInvoiceWhere(organizationId, filter, filter.range);
    const [agg, paidInvoices] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { ...invoiceWhere, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.findMany({
        where: { ...invoiceWhere, status: "PAID" },
        select: {
          issueDate: true,
          payments: { orderBy: { paymentDate: "desc" }, take: 1, select: { paymentDate: true } },
        },
      }),
    ]);

    const totalInvoiced = agg._sum.totalAmount ?? ZERO;
    const totalCollected = agg._sum.paidAmount ?? ZERO;
    const daysToPay = paidInvoices
      .filter((i) => i.payments.length > 0)
      .map((i) => (i.payments[0].paymentDate.getTime() - i.issueDate.getTime()) / DAY_MS);
    const averageDaysToFullPayment =
      daysToPay.length > 0 ? daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length : null;

    return {
      invoiceCount: agg._count._all,
      paidInvoiceCount: paidInvoices.length,
      totalInvoiced: totalInvoiced.toString(),
      totalCollected: totalCollected.toString(),
      collectionRate: totalInvoiced.gt(0) ? Number(totalCollected.div(totalInvoiced).mul(100).toFixed(4)) : 0,
      averageDaysToFullPayment,
    };
  }

  private async computeExpenseBreakdown(organizationId: string, filter: ResolvedReportFilter) {
    const expenseWhere = buildExpenseWhere(organizationId, filter, filter.range);
    const groups = await this.prisma.expense.groupBy({
      by: ["category"],
      where: { ...expenseWhere, status: "APPROVED" },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return groups
      .map((g) => ({ category: g.category, amount: (g._sum.amount ?? ZERO).toString(), count: g._count._all }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
  }

  /// Only APPROVED expenses ever count — "Use only APPROVED expenses in
  /// financial/profitability calculations" per the phase spec, matching
  /// FinanceService's order-profitability rule from the prior phase.
  private async computeOrderProfitability(
    organizationId: string,
    filter: ResolvedReportFilter,
  ): Promise<OrderProfitabilityRow[]> {
    const orderWhere = buildOrderWhere(organizationId, filter, filter.range);
    const orders = await this.prisma.order.findMany({
      where: { ...orderWhere, status: "DELIVERED" },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        driverId: true,
        vehicleId: true,
        pickupCity: true,
        deliveryCity: true,
        price: true,
        currency: true,
      },
    });
    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const expenseAgg = await this.prisma.expense.groupBy({
      by: ["orderId"],
      where: { organizationId, status: "APPROVED", orderId: { in: orderIds } },
      _sum: { amount: true },
    });
    const expenseByOrder = new Map(expenseAgg.map((e) => [e.orderId as string, e._sum.amount ?? ZERO]));

    return orders.map((o) => {
      const approvedExpenses = expenseByOrder.get(o.id) ?? ZERO;
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        customerId: o.customerId,
        driverId: o.driverId,
        vehicleId: o.vehicleId,
        pickupCity: o.pickupCity,
        deliveryCity: o.deliveryCity,
        currency: o.currency,
        revenue: o.price,
        approvedExpenses,
        estimatedGrossProfit: o.price.sub(approvedExpenses),
      };
    });
  }

  private groupProfitability(
    rows: OrderProfitabilityRow[],
    keyFn: (row: OrderProfitabilityRow) => string,
    labelFn: (row: OrderProfitabilityRow) => string,
  ) {
    const map = new Map<string, { label: string; revenue: Prisma.Decimal; approvedExpenses: Prisma.Decimal; orderCount: number }>();
    for (const row of rows) {
      const key = keyFn(row);
      const existing = map.get(key) ?? { label: labelFn(row), revenue: ZERO, approvedExpenses: ZERO, orderCount: 0 };
      existing.revenue = existing.revenue.add(row.revenue);
      existing.approvedExpenses = existing.approvedExpenses.add(row.approvedExpenses);
      existing.orderCount += 1;
      map.set(key, existing);
    }
    return [...map.entries()]
      .map(([id, v]) => ({
        id,
        label: v.label,
        orderCount: v.orderCount,
        revenue: v.revenue.toString(),
        approvedExpenses: v.approvedExpenses.toString(),
        estimatedGrossProfit: v.revenue.sub(v.approvedExpenses).toString(),
      }))
      .sort((a, b) => Number(b.estimatedGrossProfit) - Number(a.estimatedGrossProfit));
  }

  // -----------------------------------------------------------------------
  // CSV export
  // -----------------------------------------------------------------------

  /// Each report type exports the single most naturally tabular slice of
  /// its data (CSV has no concept of multiple sheets/sections):
  /// executive-overview -> the daily/monthly time series; operations -> all
  /// five exception lists concatenated with a leading type column;
  /// financial -> the full per-order profitability table. Documented in
  /// docs/REPORTS_NOTIFICATIONS_API.md.
  async exportCsv(organizationId: string, dto: ExportReportQueryDto): Promise<{ filename: string; csv: string }> {
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

    let headers: string[];
    let rows: (string | number | boolean | Date | null | undefined)[][];

    if (dto.type === "executive-overview") {
      const report = await this.executiveOverview(organizationId, dto);
      const deliveryByBucket = new Map(report.deliveryPerformanceTimeSeries.map((d) => [d.bucket, d]));
      headers = ["bucket", "revenue", "expenses", "delivered", "delayed"];
      rows = report.revenueVsExpensesTimeSeries.map((r) => {
        const delivery = deliveryByBucket.get(r.bucket);
        return [r.bucket, r.revenue, r.expenses, delivery?.delivered ?? 0, delivery?.delayed ?? 0];
      });
    } else if (dto.type === "operations") {
      const report = await this.operations(organizationId, dto);
      headers = [
        "exceptionType",
        "orderId",
        "orderNumber",
        "customerId",
        "status",
        "pickupCity",
        "deliveryCity",
        "deliveryDate",
        "price",
        "currency",
      ];
      const rowsFor = (
        type: string,
        list: { orderId: string; orderNumber: string; customerId: string; status: string; pickupCity: string; deliveryCity: string; deliveryDate: Date; price: string; currency: string }[],
      ) =>
        list.map((o) => [
          type,
          o.orderId,
          o.orderNumber,
          o.customerId,
          o.status,
          o.pickupCity,
          o.deliveryCity,
          o.deliveryDate.toISOString(),
          o.price,
          o.currency,
        ]);
      rows = [
        ...rowsFor("DELAYED", report.exceptions.delayedOrders),
        ...rowsFor("UNASSIGNED", report.exceptions.unassignedActiveOrders),
        ...rowsFor("CANCELLED", report.exceptions.cancelledOrders),
        ...rowsFor("NEGATIVE_PROFIT", report.exceptions.negativeProfitOrders),
        ...rowsFor("DELIVERED_WITHOUT_INVOICE", report.exceptions.deliveredWithoutInvoice),
      ];
    } else {
      const report = await this.financial(organizationId, dto);
      headers = ["orderId", "orderNumber", "revenue", "approvedExpenses", "estimatedGrossProfit", "currency"];
      rows = report.profitability.byOrder.map((o) => [
        o.orderId,
        o.orderNumber,
        o.revenue,
        o.approvedExpenses,
        o.estimatedGrossProfit,
        o.currency,
      ]);
    }

    return { filename: reportCsvFilename(organization.slug, dto.type), csv: toCsv(headers, rows) };
  }

  private filtersToResponse(filter: ResolvedReportFilter, dto: ReportFilterDto) {
    return {
      dateFrom: filter.range.from,
      dateTo: filter.range.to,
      comparisonPeriod: dto.comparisonPeriod,
      timezone: filter.timezone,
    };
  }
}
