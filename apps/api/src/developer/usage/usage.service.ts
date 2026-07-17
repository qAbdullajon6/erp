import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface UsageStatsResponse {
  totalCalls: number;
  avgLatencyMs: number;
  /// HTTP status code -> count. Keyed by string because that is what the
  /// chart consumes and what JSON gives back anyway.
  statusBreakdown: Record<string, number>;
  /// Route template -> count.
  endpointBreakdown: Record<string, number>;
  successCount: number;
  failureCount: number;
  successRate: number;
  webhookDeliveries: {
    total: number;
    delivered: number;
    failed: number;
    successRate: number;
  };
  lastActivityAt: string | null;
  dailyUsage: Array<{ date: string; count: number }>;
  monthlyUsage: Array<{ month: string; count: number }>;
}

/// Default window when the caller names neither bound: the last 30 days,
/// matching what the Usage tab requests on first paint.
const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  /// `startDate`/`endDate` are date-only strings (YYYY-MM-DD) as sent by the
  /// tab's <input type="date">. The end bound is widened to the end of that
  /// day so "today" includes calls made today, rather than silently meaning
  /// "up to midnight this morning".
  async getStats(
    organizationId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<UsageStatsResponse> {
    const end = endDate ? endOfDay(endDate) : new Date();
    const start = startDate
      ? startOfDay(startDate)
      : new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);

    const records = await this.prisma.apiUsageRecord.findMany({
      where: { organizationId, createdAt: { gte: start, lte: end } },
      select: { endpoint: true, statusCode: true, durationMs: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const statusBreakdown: Record<string, number> = {};
    const endpointBreakdown: Record<string, number> = {};
    const dailyCounts = new Map<string, number>();
    const monthlyCounts = new Map<string, number>();

    let totalDuration = 0;
    let successCount = 0;

    for (const record of records) {
      const status = String(record.statusCode);
      statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;
      endpointBreakdown[record.endpoint] = (endpointBreakdown[record.endpoint] ?? 0) + 1;
      totalDuration += record.durationMs;

      if (record.statusCode < 400) successCount += 1;

      const day = record.createdAt.toISOString().slice(0, 10);
      dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);

      const month = record.createdAt.toISOString().slice(0, 7);
      monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1);
    }

    const totalCalls = records.length;
    const failureCount = totalCalls - successCount;

    const deliveries = await this.prisma.webhookDelivery.groupBy({
      by: ["status"],
      where: { organizationId, createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    });

    const deliveryCounts = Object.fromEntries(
      deliveries.map((d) => [d.status, d._count._all]),
    ) as Record<string, number>;
    const deliveredTotal = deliveryCounts.DELIVERED ?? 0;
    const failedTotal = deliveryCounts.FAILED ?? 0;
    const deliveryTotal = Object.values(deliveryCounts).reduce((sum, n) => sum + n, 0);
    // Only settled deliveries count toward the rate: a PENDING row has not
    // succeeded or failed yet, and counting it as either would make the
    // number lurch as the queue drains.
    const settledTotal = deliveredTotal + failedTotal;

    return {
      totalCalls,
      avgLatencyMs: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      statusBreakdown,
      endpointBreakdown,
      successCount,
      failureCount,
      successRate: totalCalls > 0 ? round2((successCount / totalCalls) * 100) : 0,
      webhookDeliveries: {
        total: deliveryTotal,
        delivered: deliveredTotal,
        failed: failedTotal,
        successRate: settledTotal > 0 ? round2((deliveredTotal / settledTotal) * 100) : 0,
      },
      // records is ordered createdAt desc, so the head is the latest call.
      lastActivityAt: records[0]?.createdAt.toISOString() ?? null,
      dailyUsage: [...dailyCounts.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      monthlyUsage: [...monthlyCounts.entries()]
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }
}

function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
