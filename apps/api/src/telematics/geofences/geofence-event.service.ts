import { Injectable } from "@nestjs/common";
import { GeofenceEvent, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { ListGeofenceEventsQueryDto } from "../dto/list-geofence-events-query.dto";

/// Read-only access to the arrival/departure/dwell trail. The events are
/// written by GeofenceService at ingest; this is the query side used by the
/// UI's activity log and by reporting.
@Injectable()
export class GeofenceEventService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ListGeofenceEventsQueryDto) {
    const where: Prisma.GeofenceEventWhereInput = {
      organizationId,
      ...(query.geofenceId ? { geofenceId: query.geofenceId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? { occurredAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.geofenceEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.geofenceEvent.count({ where }),
    ]);
    return {
      items: rows.map((e) => this.toResponse(e)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  private toResponse(e: GeofenceEvent) {
    return {
      id: e.id,
      geofenceId: e.geofenceId,
      vehicleId: e.vehicleId,
      driverId: e.driverId,
      tripId: e.tripId,
      type: e.type,
      occurredAt: e.occurredAt,
      latitude: e.latitude,
      longitude: e.longitude,
      dwellSec: e.dwellSec,
    };
  }
}
