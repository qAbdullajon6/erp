import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  TrackingSessionSource,
  TrackingSessionStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { IngestionService, type IngestResult } from "../ingestion/ingestion.service";
import { MIN_HEARTBEAT_INTERVAL_MS } from "../ingestion/ingest-validation";
import type { NormalizedPosition } from "../providers/telematics-provider.interface";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import { TelematicsSettingsService } from "../settings/telematics-settings.service";
import { TrackingDebugBufferService } from "../debug/tracking-debug-buffer.service";
import type {
  TrackingHeartbeatView,
  TrackingHistoryPoint,
  TrackingLivePosition,
  TrackingReceiveResult,
} from "./tracking.types";

const LIVE_DISPATCH_STATUSES = [
  "ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "AT_PICKUP",
  "IN_TRANSIT",
] as const;

export interface OpenSessionInput {
  vehicleId?: string | null;
  driverId?: string | null;
  deviceId?: string | null;
  dispatchId?: string | null;
  source: TrackingSessionSource;
  metadata?: Prisma.InputJsonValue;
}

export interface HistoryQuery {
  vehicleId?: string;
  driverId?: string;
  from: Date;
  to: Date;
  limit: number;
}

/// Fleet Tracking foundation facade.
///
/// Responsibilities (Phase 1 only):
///   1. Validate and receive GPS into the existing ingest pipeline
///   2. Persist / refresh TrackingSession presence (heartbeat)
///   3. Read live position from VehicleTelematicsState (live cache)
///   4. Read bounded history from GpsPosition
///   5. Publish live SSE events (including heartbeat)
///
/// It does NOT own alerts, geofences, ETA, routing, or trip replay — those
/// remain on their existing services for later phases. IngestionService stays
/// the sole writer of GpsPosition + VehicleTelematicsState.
@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly settings: TelematicsSettingsService,
    private readonly realtime: TelematicsRealtimeService,
    private readonly debugBuffer: TrackingDebugBufferService,
  ) {}

  // ---------------------------------------------------------------------------
  // Receive GPS
  // ---------------------------------------------------------------------------

  async receiveForVehicle(
    organizationId: string,
    vehicleId: string,
    positions: NormalizedPosition[],
    options: {
      driverId?: string | null;
      deviceId?: string | null;
      dispatchId?: string | null;
      source: TrackingSessionSource;
    },
  ): Promise<TrackingReceiveResult> {
    if (positions.length === 0) {
      return { accepted: 0, rejected: 0, tripId: null, sessionId: null, latest: null };
    }
    const result = await this.ingestion.ingestForVehicle(
      {
        organizationId,
        vehicleId,
        driverId: options.driverId,
        deviceId: options.deviceId,
        source: options.source,
      },
      positions,
    );
    const session = await this.touchSessionAfterGps(organizationId, {
      vehicleId,
      driverId: options.driverId ?? null,
      deviceId: options.deviceId ?? null,
      dispatchId: options.dispatchId ?? null,
      source: options.source,
      lastPositionAt: result.latest?.recordedAt ?? new Date(),
    });
    return this.toReceiveResult(result, session?.id ?? null);
  }

  async receiveForDriver(
    organizationId: string,
    userId: string,
    positions: NormalizedPosition[],
  ): Promise<TrackingReceiveResult> {
    if (positions.length === 0) {
      return { accepted: 0, rejected: 0, tripId: null, sessionId: null, latest: null };
    }

    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException("No driver profile is linked to your account");
    }

    const dispatch = await this.prisma.dispatch.findFirst({
      where: {
        organizationId,
        driverId: driver.id,
        status: { in: [...LIVE_DISPATCH_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, vehicleId: true },
    });
    if (!dispatch) {
      throw new NotFoundException("You have no active dispatch to attribute a location to");
    }
    if (!dispatch.vehicleId) {
      throw new BadRequestException("Your active dispatch has no assigned vehicle");
    }

    // Vehicle change / reassignment: end DRIVER_APP sessions on other vehicles
    // so the fleet map never shows two live phone sessions for one driver.
    await this.endDriverAppSessionsExceptVehicle(organizationId, driver.id, dispatch.vehicleId);

    const result = await this.ingestion.ingestForVehicle(
      {
        organizationId,
        vehicleId: dispatch.vehicleId,
        driverId: driver.id,
        source: TrackingSessionSource.DRIVER_APP,
      },
      positions,
    );
    const session = await this.touchSessionAfterGps(organizationId, {
      vehicleId: dispatch.vehicleId,
      driverId: driver.id,
      dispatchId: dispatch.id,
      source: TrackingSessionSource.DRIVER_APP,
      lastPositionAt: result.latest?.recordedAt ?? new Date(),
    });
    return this.toReceiveResult(result, session?.id ?? null);
  }

  async receiveForDevice(
    organizationId: string,
    target: { vehicleId: string; deviceId: string; driverId?: string | null },
    positions: NormalizedPosition[],
  ): Promise<TrackingReceiveResult> {
    if (positions.length === 0) {
      return { accepted: 0, rejected: 0, tripId: null, sessionId: null, latest: null };
    }
    const result = await this.ingestion.ingestForVehicle(
      {
        organizationId,
        vehicleId: target.vehicleId,
        deviceId: target.deviceId,
        driverId: target.driverId,
        source: TrackingSessionSource.DEVICE,
      },
      positions,
    );
    const session = await this.touchSessionAfterGps(organizationId, {
      vehicleId: target.vehicleId,
      deviceId: target.deviceId,
      driverId: target.driverId ?? null,
      source: TrackingSessionSource.DEVICE,
      lastPositionAt: result.latest?.recordedAt ?? new Date(),
    });
    return this.toReceiveResult(result, session?.id ?? null);
  }

  // ---------------------------------------------------------------------------
  // Sessions + heartbeat
  // ---------------------------------------------------------------------------

  async openSession(organizationId: string, input: OpenSessionInput) {
    if (!input.vehicleId && !input.driverId && !input.deviceId && !input.dispatchId) {
      throw new BadRequestException(
        "A tracking session requires at least one of vehicleId, driverId, deviceId, or dispatchId",
      );
    }
    await this.assertBindings(organizationId, input);

    if (input.vehicleId) {
      const existing = await this.prisma.trackingSession.findFirst({
        where: {
          organizationId,
          vehicleId: input.vehicleId,
          source: input.source,
          status: TrackingSessionStatus.ACTIVE,
        },
      });
      if (existing) {
        return this.prisma.trackingSession.update({
          where: { id: existing.id },
          data: {
            driverId: input.driverId ?? existing.driverId,
            deviceId: input.deviceId ?? existing.deviceId,
            dispatchId: input.dispatchId ?? existing.dispatchId,
            lastHeartbeatAt: new Date(),
            metadata: input.metadata ?? undefined,
          },
        });
      }
    }

    return this.prisma.trackingSession.create({
      data: {
        organizationId,
        vehicleId: input.vehicleId ?? null,
        driverId: input.driverId ?? null,
        deviceId: input.deviceId ?? null,
        dispatchId: input.dispatchId ?? null,
        source: input.source,
        status: TrackingSessionStatus.ACTIVE,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async heartbeat(
    organizationId: string,
    sessionId: string,
    metadata?: Prisma.InputJsonValue,
    options?: { actorUserId?: string; requireDriverOwnership?: boolean },
  ) {
    const session = await this.prisma.trackingSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) throw new NotFoundException("Tracking session not found");
    if (session.status !== TrackingSessionStatus.ACTIVE) {
      throw new BadRequestException("Cannot heartbeat an ended tracking session");
    }

    if (options?.requireDriverOwnership) {
      if (!options.actorUserId) {
        throw new ForbiddenException("Driver identity required for this heartbeat");
      }
      await this.assertDriverOwnsSession(organizationId, options.actorUserId, session);
    }

    const now = new Date();
    const sinceLast = now.getTime() - session.lastHeartbeatAt.getTime();
    if (sinceLast < MIN_HEARTBEAT_INTERVAL_MS) {
      throw new BadRequestException(
        `Heartbeat too frequent — wait at least ${MIN_HEARTBEAT_INTERVAL_MS}ms between heartbeats`,
      );
    }

    const updated = await this.prisma.trackingSession.update({
      where: { id: session.id },
      data: {
        lastHeartbeatAt: now,
        metadata: metadata ?? undefined,
      },
    });

    this.realtime.publish(organizationId, {
      type: "heartbeat",
      vehicleId: updated.vehicleId,
      payload: {
        sessionId: updated.id,
        vehicleId: updated.vehicleId,
        driverId: updated.driverId,
        dispatchId: updated.dispatchId,
        deviceId: updated.deviceId,
        source: updated.source,
        lastHeartbeatAt: updated.lastHeartbeatAt.toISOString(),
      },
      at: now.toISOString(),
    });

    this.debugBuffer.recordEvent({
      organizationId,
      kind: "heartbeat",
      at: now.toISOString(),
      vehicleId: updated.vehicleId,
      driverId: updated.driverId,
      dispatchId: updated.dispatchId,
      sessionId: updated.id,
      tripId: null,
      message: "Tracking session heartbeat",
      meta: { source: updated.source },
    });

    return this.toHeartbeatView(updated, false);
  }

  /// Driver convenience: refresh the active DRIVER_APP session without GPS.
  async heartbeatForDriver(
    organizationId: string,
    userId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!driver) {
      throw new NotFoundException("No driver profile is linked to your account");
    }

    const session = await this.prisma.trackingSession.findFirst({
      where: {
        organizationId,
        driverId: driver.id,
        source: TrackingSessionSource.DRIVER_APP,
        status: TrackingSessionStatus.ACTIVE,
      },
      orderBy: { lastHeartbeatAt: "desc" },
    });
    if (!session) {
      throw new NotFoundException("No active driver tracking session — send GPS first");
    }

    return this.heartbeat(organizationId, session.id, metadata, {
      actorUserId: userId,
      requireDriverOwnership: true,
    });
  }

  async endSession(organizationId: string, sessionId: string) {
    const session = await this.prisma.trackingSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) throw new NotFoundException("Tracking session not found");
    if (session.status === TrackingSessionStatus.ENDED) return session;

    const ended = await this.prisma.trackingSession.update({
      where: { id: session.id },
      data: {
        status: TrackingSessionStatus.ENDED,
        endedAt: new Date(),
      },
    });

    this.realtime.publish(organizationId, {
      type: "heartbeat",
      vehicleId: ended.vehicleId,
      payload: {
        sessionId: ended.id,
        vehicleId: ended.vehicleId,
        driverId: ended.driverId,
        dispatchId: ended.dispatchId,
        source: ended.source,
        status: ended.status,
        endedAt: ended.endedAt?.toISOString() ?? null,
      },
      at: new Date().toISOString(),
    });

    this.debugBuffer.recordEvent({
      organizationId,
      kind: "session_closed",
      at: new Date().toISOString(),
      vehicleId: ended.vehicleId,
      driverId: ended.driverId,
      dispatchId: ended.dispatchId,
      sessionId: ended.id,
      tripId: null,
      message: "Tracking session closed",
      meta: { source: ended.source },
    });

    return ended;
  }

  /// Close every ACTIVE session bound to a dispatch (delivered / cancelled).
  async endSessionsForDispatch(organizationId: string, dispatchId: string): Promise<number> {
    const ended = await this.endSessionsWhere(organizationId, { dispatchId });
    if (ended > 0) {
      this.debugBuffer.recordEvent({
        organizationId,
        kind: "dispatch_finished",
        at: new Date().toISOString(),
        vehicleId: null,
        driverId: null,
        dispatchId,
        sessionId: null,
        tripId: null,
        message: `Closed ${ended} tracking session(s) for finished dispatch`,
      });
    }
    return ended;
  }

  /// Close DRIVER_APP sessions for a logged-out user.
  async endSessionsForUser(organizationId: string, userId: string): Promise<number> {
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!driver) return 0;
    return this.endSessionsWhere(organizationId, {
      driverId: driver.id,
      source: TrackingSessionSource.DRIVER_APP,
    });
  }

  /// Close DRIVER_APP sessions on the previous vehicle after reassignment.
  async endSessionsOnVehicleReassign(
    organizationId: string,
    input: { previousVehicleId: string; dispatchId: string; driverId?: string | null },
  ): Promise<number> {
    return this.endSessionsWhere(organizationId, {
      vehicleId: input.previousVehicleId,
      dispatchId: input.dispatchId,
      source: TrackingSessionSource.DRIVER_APP,
      ...(input.driverId ? { driverId: input.driverId } : {}),
    });
  }

  /// Sweeper: end ACTIVE sessions whose heartbeat is older than the org offline threshold.
  async endStaleSessions(organizationId: string, offlineThresholdSec: number): Promise<number> {
    const cutoff = new Date(Date.now() - offlineThresholdSec * 1000);
    const stale = await this.prisma.trackingSession.findMany({
      where: {
        organizationId,
        status: TrackingSessionStatus.ACTIVE,
        lastHeartbeatAt: { lt: cutoff },
      },
      select: { id: true },
    });
    let ended = 0;
    for (const row of stale) {
      await this.endSession(organizationId, row.id);
      ended += 1;
    }
    return ended;
  }

  async latestHeartbeat(
    organizationId: string,
    query: { sessionId?: string; vehicleId?: string; driverId?: string; dispatchId?: string },
  ): Promise<TrackingHeartbeatView> {
    if (!query.sessionId && !query.vehicleId && !query.driverId && !query.dispatchId) {
      throw new BadRequestException("Provide sessionId, vehicleId, driverId, or dispatchId");
    }

    const session = query.sessionId
      ? await this.prisma.trackingSession.findFirst({
          where: { id: query.sessionId, organizationId },
        })
      : await this.prisma.trackingSession.findFirst({
          where: {
            organizationId,
            ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
            ...(query.driverId ? { driverId: query.driverId } : {}),
            ...(query.dispatchId ? { dispatchId: query.dispatchId } : {}),
          },
          orderBy: { lastHeartbeatAt: "desc" },
        });

    if (!session) throw new NotFoundException("No tracking heartbeat found");

    const settings = await this.settings.getOrCreate(organizationId);
    const staleMs = settings.offlineThresholdSec * 1000;
    const isStale = Date.now() - session.lastHeartbeatAt.getTime() > staleMs;
    return this.toHeartbeatView(session, isStale);
  }

  // ---------------------------------------------------------------------------
  // Live position reads
  // ---------------------------------------------------------------------------

  async fleetLatest(organizationId: string): Promise<{ generatedAt: Date; vehicles: TrackingLivePosition[] }> {
    const [states, settings, sessions] = await Promise.all([
      this.prisma.vehicleTelematicsState.findMany({ where: { organizationId } }),
      this.settings.getOrCreate(organizationId),
      this.prisma.trackingSession.findMany({
        where: { organizationId, status: TrackingSessionStatus.ACTIVE },
        select: {
          id: true,
          vehicleId: true,
          dispatchId: true,
          lastHeartbeatAt: true,
          source: true,
        },
      }),
    ]);

    if (states.length === 0) {
      return { generatedAt: new Date(), vehicles: [] };
    }

    const vehicleIds = states.map((s) => s.vehicleId);
    const driverIds = states.map((s) => s.driverId).filter((id): id is string => !!id);
    const [vehicles, drivers, liveDispatches] = await Promise.all([
      // archivedAt: null — an archived vehicle must vanish from the live fleet
      // map exactly like it vanishes from the Vehicles list; its
      // VehicleTelematicsState row otherwise lives forever (it's a last-known-
      // state cache, never deleted), which would keep showing a movable,
      // selectable pin for a vehicle the org can no longer even open normally.
      this.prisma.vehicle.findMany({
        where: { id: { in: vehicleIds }, organizationId, archivedAt: null },
        select: { id: true, vehicleCode: true, plateNumber: true },
      }),
      driverIds.length > 0
        ? this.prisma.driver.findMany({
            where: { id: { in: driverIds }, organizationId },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      this.prisma.dispatch.findMany({
        where: {
          organizationId,
          vehicleId: { in: vehicleIds },
          status: { in: [...LIVE_DISPATCH_STATUSES] },
        },
        select: { id: true, vehicleId: true },
      }),
    ]);

    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const liveDispatchVehicleIds = new Set(liveDispatches.map((d) => d.vehicleId));
    const sessionByVehicle = new Map<
      string,
      { id: string; dispatchId: string | null; lastHeartbeatAt: Date; source: TrackingSessionSource }
    >();
    for (const s of sessions) {
      if (!s.vehicleId) continue;
      const prev = sessionByVehicle.get(s.vehicleId);
      if (!prev || s.lastHeartbeatAt > prev.lastHeartbeatAt) {
        sessionByVehicle.set(s.vehicleId, {
          id: s.id,
          dispatchId: s.dispatchId,
          lastHeartbeatAt: s.lastHeartbeatAt,
          source: s.source,
        });
      }
    }

    const now = Date.now();
    const staleMs = settings.offlineThresholdSec * 1000;

    return {
      generatedAt: new Date(),
      // Drop states whose vehicle wasn't returned above — either it belongs
      // to another org (shouldn't happen) or, the real case, it's archived.
      vehicles: states.filter((state) => vehicleById.has(state.vehicleId)).map((state) => {
        const vehicle = vehicleById.get(state.vehicleId);
        const driver = state.driverId ? driverById.get(state.driverId) : null;
        const session = sessionByVehicle.get(state.vehicleId) ?? null;
        const isStale = !state.lastReceivedAt || now - state.lastReceivedAt.getTime() > staleMs;
        return this.mapLivePosition({
          state,
          vehicleCode: vehicle?.vehicleCode ?? null,
          plateNumber: vehicle?.plateNumber ?? null,
          driverName: driver ? `${driver.firstName} ${driver.lastName}` : null,
          sessionId: session?.id ?? null,
          sessionSource: session?.source ?? null,
          dispatchId: session?.dispatchId ?? null,
          hasActiveDispatch: liveDispatchVehicleIds.has(state.vehicleId),
          lastHeartbeatAt: session?.lastHeartbeatAt ?? null,
          isStale,
        });
      }),
    };
  }

  async vehicleLatest(organizationId: string, vehicleId: string): Promise<TrackingLivePosition> {
    // archivedAt: null — live/detail lookups must treat archived vehicles like
    // missing ones (404 "Vehicle not found") so existence is never leaked.
    // History / ingest paths are intentionally separate and untouched here.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId, archivedAt: null },
      select: { id: true, vehicleCode: true, plateNumber: true },
    });
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    const [state, session, settings, liveDispatch] = await Promise.all([
      this.prisma.vehicleTelematicsState.findFirst({ where: { organizationId, vehicleId } }),
      this.prisma.trackingSession.findFirst({
        where: { organizationId, vehicleId, status: TrackingSessionStatus.ACTIVE },
        orderBy: { lastHeartbeatAt: "desc" },
      }),
      this.settings.getOrCreate(organizationId),
      this.prisma.dispatch.findFirst({
        where: {
          organizationId,
          vehicleId,
          status: { in: [...LIVE_DISPATCH_STATUSES] },
        },
        select: { id: true },
      }),
    ]);

    if (!state) {
      return {
        vehicleId: vehicle.id,
        vehicleCode: vehicle.vehicleCode,
        plateNumber: vehicle.plateNumber,
        driverId: null,
        driverName: null,
        dispatchId: session?.dispatchId ?? null,
        hasActiveDispatch: !!liveDispatch,
        tripId: null,
        sessionId: session?.id ?? null,
        sessionSource: session?.source ?? null,
        latitude: null,
        longitude: null,
        speedKph: null,
        heading: null,
        ignitionOn: null,
        odometerKm: null,
        fuelLevelPct: null,
        movementState: "UNKNOWN",
        isStale: true,
        lastRecordedAt: null,
        lastReceivedAt: null,
        lastHeartbeatAt: session?.lastHeartbeatAt ?? null,
      };
    }

    const driver = state.driverId
      ? await this.prisma.driver.findFirst({
          where: { id: state.driverId, organizationId },
          select: { firstName: true, lastName: true },
        })
      : null;

    const staleMs = settings.offlineThresholdSec * 1000;
    const isStale = !state.lastReceivedAt || Date.now() - state.lastReceivedAt.getTime() > staleMs;

    return this.mapLivePosition({
      state,
      vehicleCode: vehicle.vehicleCode,
      plateNumber: vehicle.plateNumber,
      driverName: driver ? `${driver.firstName} ${driver.lastName}` : null,
      sessionId: session?.id ?? null,
      sessionSource: session?.source ?? null,
      dispatchId: session?.dispatchId ?? null,
      hasActiveDispatch: !!liveDispatch,
      lastHeartbeatAt: session?.lastHeartbeatAt ?? null,
      isStale,
    });
  }

  async driverLatest(organizationId: string, driverId: string): Promise<TrackingLivePosition> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!driver) throw new NotFoundException("Driver not found");

    const byDriverState = await this.prisma.vehicleTelematicsState.findFirst({
      where: { organizationId, driverId },
      orderBy: { lastReceivedAt: "desc" },
    });
    if (byDriverState) {
      return this.vehicleLatest(organizationId, byDriverState.vehicleId);
    }

    const dispatch = await this.prisma.dispatch.findFirst({
      where: {
        organizationId,
        driverId,
        status: { in: [...LIVE_DISPATCH_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
      select: { vehicleId: true },
    });
    if (!dispatch) {
      throw new NotFoundException("No live position for this driver");
    }
    return this.vehicleLatest(organizationId, dispatch.vehicleId);
  }

  async dispatchLatest(organizationId: string, dispatchId: string): Promise<TrackingLivePosition> {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: dispatchId, organizationId },
      select: { id: true, vehicleId: true, driverId: true },
    });
    if (!dispatch) throw new NotFoundException("Dispatch not found");

    const position = await this.vehicleLatest(organizationId, dispatch.vehicleId);
    return {
      ...position,
      driverId: position.driverId ?? dispatch.driverId,
      dispatchId: dispatch.id,
    };
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  async history(organizationId: string, query: HistoryQuery): Promise<{
    vehicleId: string | null;
    driverId: string | null;
    from: string;
    to: string;
    pointCount: number;
    points: TrackingHistoryPoint[];
  }> {
    if (!query.vehicleId && !query.driverId) {
      throw new BadRequestException("Provide vehicleId or driverId");
    }
    if (query.from.getTime() > query.to.getTime()) {
      throw new BadRequestException("`from` must be before or equal to `to`");
    }

    if (query.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: query.vehicleId, organizationId },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException("Vehicle not found");
    }
    if (query.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: query.driverId, organizationId },
        select: { id: true },
      });
      if (!driver) throw new NotFoundException("Driver not found");
    }

    const points = await this.prisma.gpsPosition.findMany({
      where: {
        organizationId,
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(query.driverId ? { driverId: query.driverId } : {}),
        recordedAt: { gte: query.from, lte: query.to },
      },
      orderBy: { recordedAt: "asc" },
      take: query.limit,
      select: {
        recordedAt: true,
        latitude: true,
        longitude: true,
        speedKph: true,
        heading: true,
        movementState: true,
        tripId: true,
      },
    });

    return {
      vehicleId: query.vehicleId ?? null,
      driverId: query.driverId ?? null,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      pointCount: points.length,
      points: points.map((p) => ({
        at: p.recordedAt,
        lat: p.latitude,
        lng: p.longitude,
        speedKph: p.speedKph,
        heading: p.heading,
        movementState: p.movementState,
        tripId: p.tripId,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async endSessionsWhere(
    organizationId: string,
    where: {
      dispatchId?: string;
      driverId?: string;
      vehicleId?: string;
      source?: TrackingSessionSource;
    },
  ): Promise<number> {
    const rows = await this.prisma.trackingSession.findMany({
      where: {
        organizationId,
        status: TrackingSessionStatus.ACTIVE,
        ...(where.dispatchId ? { dispatchId: where.dispatchId } : {}),
        ...(where.driverId ? { driverId: where.driverId } : {}),
        ...(where.vehicleId ? { vehicleId: where.vehicleId } : {}),
        ...(where.source ? { source: where.source } : {}),
      },
      select: { id: true },
    });
    let ended = 0;
    for (const row of rows) {
      await this.endSession(organizationId, row.id);
      ended += 1;
    }
    return ended;
  }

  private async endDriverAppSessionsExceptVehicle(
    organizationId: string,
    driverId: string,
    keepVehicleId: string,
  ): Promise<void> {
    const stale = await this.prisma.trackingSession.findMany({
      where: {
        organizationId,
        driverId,
        source: TrackingSessionSource.DRIVER_APP,
        status: TrackingSessionStatus.ACTIVE,
        OR: [{ vehicleId: null }, { vehicleId: { not: keepVehicleId } }],
      },
      select: { id: true },
    });
    for (const row of stale) {
      await this.endSession(organizationId, row.id);
    }
  }

  private async assertDriverOwnsSession(
    organizationId: string,
    userId: string,
    session: { driverId: string | null; source: TrackingSessionSource },
  ): Promise<void> {
    if (session.source !== TrackingSessionSource.DRIVER_APP) {
      throw new ForbiddenException("Drivers may only heartbeat DRIVER_APP sessions");
    }
    const driver = await this.prisma.driver.findFirst({
      where: { organizationId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!driver || session.driverId !== driver.id) {
      throw new ForbiddenException("This tracking session does not belong to you");
    }
  }

  private toReceiveResult(result: IngestResult, sessionId: string | null): TrackingReceiveResult {
    return {
      accepted: result.accepted,
      rejected: result.rejected,
      tripId: result.tripId,
      sessionId,
      latest: result.latest,
    };
  }

  private async touchSessionAfterGps(
    organizationId: string,
    input: {
      vehicleId: string;
      driverId?: string | null;
      deviceId?: string | null;
      dispatchId?: string | null;
      source: TrackingSessionSource;
      lastPositionAt: Date;
    },
  ) {
    const now = new Date();
    const existing = await this.prisma.trackingSession.findFirst({
      where: {
        organizationId,
        vehicleId: input.vehicleId,
        source: input.source,
        status: TrackingSessionStatus.ACTIVE,
      },
    });

    if (existing) {
      return this.prisma.trackingSession.update({
        where: { id: existing.id },
        data: {
          driverId: input.driverId ?? existing.driverId,
          deviceId: input.deviceId ?? existing.deviceId,
          dispatchId: input.dispatchId ?? existing.dispatchId,
          lastHeartbeatAt: now,
          lastPositionAt: input.lastPositionAt,
        },
      });
    }

    try {
      return await this.prisma.trackingSession.create({
        data: {
          organizationId,
          vehicleId: input.vehicleId,
          driverId: input.driverId ?? null,
          deviceId: input.deviceId ?? null,
          dispatchId: input.dispatchId ?? null,
          source: input.source,
          status: TrackingSessionStatus.ACTIVE,
          lastHeartbeatAt: now,
          lastPositionAt: input.lastPositionAt,
        },
      }).then((created) => {
        this.debugBuffer.recordEvent({
          organizationId,
          kind: "session_created",
          at: now.toISOString(),
          vehicleId: created.vehicleId,
          driverId: created.driverId,
          dispatchId: created.dispatchId,
          sessionId: created.id,
          tripId: null,
          message: `TrackingSession created (${created.source})`,
        });
        return created;
      });
    } catch (err) {
      // Race on the partial unique index: another writer opened the ACTIVE
      // session first — update that row instead of failing the GPS ingest.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raced = await this.prisma.trackingSession.findFirst({
          where: {
            organizationId,
            vehicleId: input.vehicleId,
            source: input.source,
            status: TrackingSessionStatus.ACTIVE,
          },
        });
        if (raced) {
          return this.prisma.trackingSession.update({
            where: { id: raced.id },
            data: {
              lastHeartbeatAt: now,
              lastPositionAt: input.lastPositionAt,
              driverId: input.driverId ?? raced.driverId,
              deviceId: input.deviceId ?? raced.deviceId,
              dispatchId: input.dispatchId ?? raced.dispatchId,
            },
          });
        }
      }
      throw err;
    }
  }

  private async assertBindings(organizationId: string, input: OpenSessionInput): Promise<void> {
    if (input.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException("Vehicle not found");
    }
    if (input.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: input.driverId, organizationId },
        select: { id: true },
      });
      if (!driver) throw new NotFoundException("Driver not found");
    }
    if (input.deviceId) {
      const device = await this.prisma.telematicsDevice.findFirst({
        where: { id: input.deviceId, organizationId },
        select: { id: true },
      });
      if (!device) throw new NotFoundException("Device not found");
    }
    if (input.dispatchId) {
      const dispatch = await this.prisma.dispatch.findFirst({
        where: { id: input.dispatchId, organizationId },
        select: { id: true },
      });
      if (!dispatch) throw new NotFoundException("Dispatch not found");
    }
  }

  private mapLivePosition(args: {
    state: {
      vehicleId: string;
      driverId: string | null;
      tripId: string | null;
      latitude: number | null;
      longitude: number | null;
      speedKph: number | null;
      heading: number | null;
      ignitionOn: boolean | null;
      odometerKm: number | null;
      fuelLevelPct: number | null;
      movementState: TrackingLivePosition["movementState"];
      lastRecordedAt: Date | null;
      lastReceivedAt: Date | null;
    };
    vehicleCode: string | null;
    plateNumber: string | null;
    driverName: string | null;
    sessionId: string | null;
    sessionSource: TrackingSessionSource | null;
    dispatchId: string | null;
    hasActiveDispatch: boolean;
    lastHeartbeatAt: Date | null;
    isStale: boolean;
  }): TrackingLivePosition {
    const { state } = args;
    return {
      vehicleId: state.vehicleId,
      vehicleCode: args.vehicleCode,
      plateNumber: args.plateNumber,
      driverId: state.driverId,
      driverName: args.driverName,
      dispatchId: args.dispatchId,
      hasActiveDispatch: args.hasActiveDispatch,
      tripId: state.tripId,
      sessionId: args.sessionId,
      sessionSource: args.sessionSource,
      latitude: state.latitude,
      longitude: state.longitude,
      speedKph: state.speedKph,
      heading: state.heading,
      ignitionOn: state.ignitionOn,
      odometerKm: state.odometerKm,
      fuelLevelPct: state.fuelLevelPct,
      movementState:
        args.isStale && state.movementState !== "OFFLINE" ? "OFFLINE" : state.movementState,
      isStale: args.isStale,
      lastRecordedAt: state.lastRecordedAt,
      lastReceivedAt: state.lastReceivedAt,
      lastHeartbeatAt: args.lastHeartbeatAt,
    };
  }

  private toHeartbeatView(
    session: {
      id: string;
      organizationId: string;
      vehicleId: string | null;
      driverId: string | null;
      deviceId: string | null;
      dispatchId: string | null;
      source: TrackingSessionSource;
      status: TrackingSessionStatus;
      startedAt: Date;
      lastHeartbeatAt: Date;
      lastPositionAt: Date | null;
      endedAt: Date | null;
    },
    isStale: boolean,
  ): TrackingHeartbeatView {
    return {
      sessionId: session.id,
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      driverId: session.driverId,
      deviceId: session.deviceId,
      dispatchId: session.dispatchId,
      source: session.source,
      status: session.status,
      startedAt: session.startedAt,
      lastHeartbeatAt: session.lastHeartbeatAt,
      lastPositionAt: session.lastPositionAt,
      endedAt: session.endedAt,
      isStale,
    };
  }
}
