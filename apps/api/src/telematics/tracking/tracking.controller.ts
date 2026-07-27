import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { MembershipRole } from "@prisma/client";
import { Prisma, TrackingSessionSource } from "@prisma/client";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RawResponse } from "../../common/decorators/raw-response.decorator";
import { SkipTimeout } from "../../common/decorators/skip-timeout.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { IngestPositionsDto } from "../dto/ingest-positions.dto";
import {
  OpenTrackingSessionDto,
  TrackingHeartbeatDto,
  TrackingHeartbeatQueryDto,
  TrackingHistoryQueryDto,
} from "../dto/tracking.dto";
import { normalizeIngestDto } from "../ingestion/normalize-ingest-dto";
import { openTelematicsSseStream } from "../realtime/open-sse-stream";
import { TelematicsRealtimeService } from "../realtime/telematics-realtime.service";
import { TrackingService } from "./tracking.service";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
const HISTORY_DEFAULT_LIMIT = 5_000;
const HISTORY_MAX_LIMIT = 10_000;

function asJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

/// Fleet Tracking Phase 1 REST surface.
///
/// Additive to `/telematics/*` — existing telematics routes stay intact.
/// This controller is the production foundation for current position, history,
/// heartbeat, and session presence. Replay / ETA / alerts / geofences stay on
/// their existing telematics controllers for later phases.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tracking")
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly realtime: TelematicsRealtimeService,
  ) {}

  @Roles(...OPS)
  @Get("live-stream")
  @SkipTimeout()
  @RawResponse()
  liveStream(
    @CurrentUser() user: CurrentUserPayload,
    @Query("vehicleIds") vehicleIdsParam: string | undefined,
    @Res() res: Response,
  ): void {
    const vehicleIds = vehicleIdsParam
      ? new Set(vehicleIdsParam.split(",").map((id) => id.trim()).filter(Boolean))
      : undefined;

    openTelematicsSseStream(this.realtime, res, {
      organizationId: user.organizationId,
      vehicleIds,
      tooManyMessage: "Too many active tracking streams. Please retry shortly.",
    });
  }

  @Roles(...OPS)
  @Get("live")
  fleetLatest(@CurrentUser() user: CurrentUserPayload) {
    return this.tracking.fleetLatest(user.organizationId);
  }

  @Roles(...OPS)
  @Get("vehicles/:vehicleId")
  vehicleLatest(
    @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.vehicleLatest(user.organizationId, vehicleId);
  }

  @Roles(...OPS)
  @Get("drivers/:driverId")
  driverLatest(
    @Param("driverId", ParseUUIDPipe) driverId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.driverLatest(user.organizationId, driverId);
  }

  @Roles(...OPS)
  @Get("dispatches/:dispatchId")
  dispatchLatest(
    @Param("dispatchId", ParseUUIDPipe) dispatchId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.dispatchLatest(user.organizationId, dispatchId);
  }

  @Roles(...OPS)
  @Get("history")
  history(@Query() query: TrackingHistoryQueryDto, @CurrentUser() user: CurrentUserPayload) {
    const limit = Math.min(
      Math.max(1, query.limit ?? HISTORY_DEFAULT_LIMIT),
      HISTORY_MAX_LIMIT,
    );
    return this.tracking.history(user.organizationId, {
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      from: new Date(query.from),
      to: new Date(query.to),
      limit,
    });
  }

  @Roles(...OPS)
  @Get("heartbeat")
  latestHeartbeat(
    @Query() query: TrackingHeartbeatQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.latestHeartbeat(user.organizationId, query);
  }

  @Roles(...OPS)
  @Post("sessions")
  openSession(@Body() dto: OpenTrackingSessionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.tracking.openSession(user.organizationId, {
      vehicleId: dto.vehicleId,
      driverId: dto.driverId,
      deviceId: dto.deviceId,
      dispatchId: dto.dispatchId,
      source: dto.source,
      metadata: asJson(dto.metadata),
    });
  }

  @Roles(...OPS)
  @Post("sessions/:sessionId/heartbeat")
  heartbeat(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: TrackingHeartbeatDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.heartbeat(user.organizationId, sessionId, asJson(dto.metadata));
  }

  @Roles("DRIVER")
  @Post("my-heartbeat")
  myHeartbeat(@Body() dto: TrackingHeartbeatDto, @CurrentUser() user: CurrentUserPayload) {
    return this.tracking.heartbeatForDriver(
      user.organizationId,
      user.userId,
      asJson(dto.metadata),
    );
  }

  @Roles("DRIVER")
  @Post("sessions/:sessionId/heartbeat/driver")
  driverSessionHeartbeat(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: TrackingHeartbeatDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.heartbeat(user.organizationId, sessionId, asJson(dto.metadata), {
      actorUserId: user.userId,
      requireDriverOwnership: true,
    });
  }

  @Roles(...OPS)
  @Post("sessions/:sessionId/end")
  endSession(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.endSession(user.organizationId, sessionId);
  }

  @Roles(...OPS)
  @Post("vehicles/:vehicleId/positions")
  receiveForVehicle(
    @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
    @Body() dto: IngestPositionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tracking.receiveForVehicle(
      user.organizationId,
      vehicleId,
      dto.positions.map(normalizeIngestDto),
      { source: TrackingSessionSource.STAFF },
    );
  }

  @Roles("DRIVER")
  @Post("my-location")
  receiveMyLocation(@Body() dto: IngestPositionsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.tracking.receiveForDriver(
      user.organizationId,
      user.userId,
      dto.positions.map(normalizeIngestDto),
    );
  }
}
