import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Trip, TripStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkflowEventService } from "../../workflows/triggers/workflow-event.service";
import { estimateFuelLiters } from "../analytics/fuel-model";
import type { ListTripsQueryDto } from "../dto/list-trips-query.dto";
import type { TripReplayQueryDto } from "../dto/trip-replay-query.dto";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";

/// The running totals for a trip, held in memory by the ingestion pipeline
/// across a batch of fixes and written back as ABSOLUTE values (not deltas) at
/// the end of the batch. Absolute writes keep persistence a plain update — no
/// atomic increments, no raw SQL for the running max — at the cost of assuming
/// one vehicle's fixes are processed serially, which holds because a device
/// feeds one ordered stream. Documented in FLEET_TELEMATICS_API.md.
export interface TripAggregate {
  distanceKm: number;
  durationSec: number;
  movingSec: number;
  idleSec: number;
  stopCount: number;
  maxSpeedKph: number;
  harshAccelCount: number;
  harshBrakeCount: number;
  harshCornerCount: number;
  speedingCount: number;
  pointCount: number;
  endLat: number;
  endLng: number;
  endOdometerKm: number | null;
}

export interface OpenTripContext {
  organizationId: string;
  vehicleId: string;
  driverId?: string | null;
  startedAt: Date;
  startLat: number;
  startLng: number;
  startOdometerKm?: number | null;
}

@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: TelematicsRealtimeService,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  async getActive(organizationId: string, vehicleId: string): Promise<Trip | null> {
    return this.prisma.trip.findFirst({
      where: { organizationId, vehicleId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
  }

  /// Opens a trip, linking it to the vehicle's in-progress dispatch/order when
  /// one exists so a trip and its delivery are cross-referenced.
  async open(ctx: OpenTripContext): Promise<Trip> {
    const activeDispatch = await this.prisma.dispatch.findFirst({
      where: {
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        status: { in: ["ASSIGNED", "EN_ROUTE_TO_PICKUP", "AT_PICKUP", "IN_TRANSIT"] },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, orderId: true, driverId: true },
    });

    const trip = await this.prisma.trip.create({
      data: {
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId ?? activeDispatch?.driverId ?? null,
        dispatchId: activeDispatch?.id ?? null,
        orderId: activeDispatch?.orderId ?? null,
        status: "ACTIVE",
        startedAt: ctx.startedAt,
        startLat: ctx.startLat,
        startLng: ctx.startLng,
        startOdometerKm: ctx.startOdometerKm ?? null,
        endLat: ctx.startLat,
        endLng: ctx.startLng,
      },
    });

    this.realtime.publish(ctx.organizationId, {
      type: "trip",
      vehicleId: ctx.vehicleId,
      at: ctx.startedAt.toISOString(),
      payload: { tripId: trip.id, status: "ACTIVE", event: "started" },
    });
    void this.workflowEvents.emit(ctx.organizationId, "trip.started", {
      tripId: trip.id,
      vehicleId: ctx.vehicleId,
      driverId: trip.driverId,
      dispatchId: trip.dispatchId,
    });
    return trip;
  }

  /// Persists the batch's running totals. `avgSpeedKph` is derived from
  /// distance over elapsed time here so the stored average is always
  /// consistent with the stored distance/duration.
  async saveAggregate(tripId: string, agg: TripAggregate): Promise<void> {
    const avgSpeedKph = agg.durationSec > 0 ? (agg.distanceKm / (agg.durationSec / 3600)) : 0;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        distanceKm: new Prisma.Decimal(agg.distanceKm.toFixed(3)),
        durationSec: Math.round(agg.durationSec),
        movingSec: Math.round(agg.movingSec),
        idleSec: Math.round(agg.idleSec),
        stopCount: agg.stopCount,
        maxSpeedKph: agg.maxSpeedKph,
        avgSpeedKph,
        harshAccelCount: agg.harshAccelCount,
        harshBrakeCount: agg.harshBrakeCount,
        harshCornerCount: agg.harshCornerCount,
        speedingCount: agg.speedingCount,
        pointCount: agg.pointCount,
        endLat: agg.endLat,
        endLng: agg.endLng,
        endOdometerKm: agg.endOdometerKm,
      },
    });
  }

  async close(
    organizationId: string,
    tripId: string,
    end: { at: Date; lat: number; lng: number; odometerKm?: number | null; autoClosed: boolean },
  ): Promise<Trip> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, organizationId } });
    if (!trip || trip.status !== "ACTIVE") {
      // Already closed by a concurrent sweeper/ingest — return current state.
      return trip ?? (await this.findOrThrow(organizationId, tripId));
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: trip.vehicleId }, select: { type: true } });
    const distanceKm = Number(trip.distanceKm);
    const fuel = estimateFuelLiters(distanceKm, vehicle?.type);

    const closed = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        status: "COMPLETED",
        endedAt: end.at,
        endLat: end.lat,
        endLng: end.lng,
        endOdometerKm: end.odometerKm ?? trip.endOdometerKm,
        fuelConsumedL: new Prisma.Decimal(fuel.toFixed(3)),
        autoClosed: end.autoClosed,
      },
    });

    this.realtime.publish(organizationId, {
      type: "trip",
      vehicleId: trip.vehicleId,
      at: end.at.toISOString(),
      payload: { tripId: closed.id, status: "COMPLETED", event: "completed", distanceKm },
    });
    void this.workflowEvents.emit(organizationId, "trip.completed", {
      tripId: closed.id,
      vehicleId: closed.vehicleId,
      driverId: closed.driverId,
      dispatchId: closed.dispatchId,
      distanceKm,
      durationSec: closed.durationSec,
    });
    return closed;
  }

  // --- Read APIs ----------------------------------------------------------

  async list(organizationId: string, query: ListTripsQueryDto) {
    const where: Prisma.TripWhereInput = {
      organizationId,
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dispatchId ? { dispatchId: query.dispatchId } : {}),
      ...(query.from || query.to
        ? { startedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { startedAt: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.trip.count({ where }),
    ]);
    return {
      items: rows.map((t) => this.toResponse(t)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async getById(organizationId: string, id: string) {
    return this.toResponse(await this.findOrThrow(organizationId, id));
  }

  /// Ordered positions for a trip — the route-replay payload. Bounded so a
  /// pathological trip cannot return an unbounded array.
  async replay(organizationId: string, id: string, query: TripReplayQueryDto) {
    await this.findOrThrow(organizationId, id);
    const points = await this.prisma.gpsPosition.findMany({
      where: { organizationId, tripId: id },
      orderBy: { recordedAt: "asc" },
      take: query.limit,
      select: {
        id: true,
        recordedAt: true,
        latitude: true,
        longitude: true,
        speedKph: true,
        heading: true,
        movementState: true,
      },
    });
    return {
      tripId: id,
      pointCount: points.length,
      points: points.map((p) => ({
        at: p.recordedAt,
        lat: p.latitude,
        lng: p.longitude,
        speedKph: p.speedKph,
        heading: p.heading,
        movementState: p.movementState,
      })),
    };
  }

  private async findOrThrow(organizationId: string, id: string): Promise<Trip> {
    const trip = await this.prisma.trip.findFirst({ where: { id, organizationId } });
    if (!trip) throw new NotFoundException("Trip not found");
    return trip;
  }

  private toResponse(t: Trip) {
    return {
      id: t.id,
      organizationId: t.organizationId,
      vehicleId: t.vehicleId,
      driverId: t.driverId,
      dispatchId: t.dispatchId,
      orderId: t.orderId,
      status: t.status,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      startLat: t.startLat,
      startLng: t.startLng,
      endLat: t.endLat,
      endLng: t.endLng,
      distanceKm: t.distanceKm.toString(),
      durationSec: t.durationSec,
      movingSec: t.movingSec,
      idleSec: t.idleSec,
      stopCount: t.stopCount,
      maxSpeedKph: t.maxSpeedKph,
      avgSpeedKph: t.avgSpeedKph,
      harshAccelCount: t.harshAccelCount,
      harshBrakeCount: t.harshBrakeCount,
      harshCornerCount: t.harshCornerCount,
      speedingCount: t.speedingCount,
      fuelConsumedL: t.fuelConsumedL?.toString() ?? null,
      startOdometerKm: t.startOdometerKm,
      endOdometerKm: t.endOdometerKm,
      pointCount: t.pointCount,
      autoClosed: t.autoClosed,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}

export { TripStatus };
