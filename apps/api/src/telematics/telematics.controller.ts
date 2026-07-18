import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import { SkipTimeout } from "../common/decorators/skip-timeout.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import { EtaQueryDto } from "./dto/eta-query.dto";
import { IngestPositionsDto } from "./dto/ingest-positions.dto";
import { PlaybackQueryDto } from "./dto/playback-query.dto";
import { IngestionService } from "./ingestion/ingestion.service";
import { normalizeIngestDto } from "./ingestion/normalize-ingest-dto";
import { TelematicsRealtimeService } from "./realtime/telematics-realtime.service";
import { TelematicsService } from "./telematics.service";

/// Fleet data is dispatcher-and-up, matching VehiclesController / DriversController.
const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

/// The live-tracking surface: the fleet map, a single vehicle's live picture,
/// ETA, historical playback, and the two write paths for positions (staff
/// hand-entry and a driver posting their own location).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("telematics")
export class TelematicsController {
  constructor(
    private readonly telematics: TelematicsService,
    private readonly ingestion: IngestionService,
    private readonly realtime: TelematicsRealtimeService,
  ) {}

  /// Streams live telematics events as Server-Sent Events.
  ///
  /// SSE rather than WebSockets: this is one-directional server-push over plain
  /// HTTP, so it needs no second protocol, no separate auth handshake, and no
  /// sticky-session config at the load balancer. The architecture is shared
  /// with the AI Copilot module.
  ///
  /// Optional query params:
  ///   - `vehicleIds`: comma-separated list of vehicle IDs to filter by
  ///     (e.g., `?vehicleIds=uuid1,uuid2`)
  ///
  /// Events streamed: position, state, alert, geofence, trip.
  ///
  /// @RawResponse() because the body is an SSE stream, not a JSON document —
  /// TransformInterceptor would otherwise try to wrap it.
  @Roles(...OPS)
  @Get("live-stream")
  @SkipTimeout()
  @RawResponse()
  async liveStream(
    @CurrentUser() user: CurrentUserPayload,
    @Query("vehicleIds") vehicleIdsParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Nginx buffers proxied responses by default, which would hold every event
    // until the stream ended and make streaming pointless in production.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const vehicleIds = vehicleIdsParam
      ? new Set(vehicleIdsParam.split(",").map((id) => id.trim()).filter(Boolean))
      : undefined;

    this.realtime.registerClient(res, {
      organizationId: user.organizationId,
      vehicleIds,
    });

    // The client vanishing (tab closed, navigated away) must remove them from
    // the registry, otherwise we keep trying to write to a dead stream.
    res.on("close", () => {
      this.realtime.removeClient(res);
    });

    // Send a comment (keep-alive) every 30 seconds to hold the connection open
    // through proxies that would otherwise timeout an idle stream.
    const keepAliveInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": keep-alive\n\n");
      } else {
        clearInterval(keepAliveInterval);
      }
    }, 30000);

    // Never end the stream ourselves — it stays open until the client
    // disconnects or the server shuts down.
  }

  @Roles(...OPS)
  @Get("live")
  liveFleet(@CurrentUser() user: CurrentUserPayload) {
    return this.telematics.liveFleet(user.organizationId);
  }

  @Roles(...OPS)
  @Get("live/:vehicleId")
  liveVehicle(@Param("vehicleId", ParseUUIDPipe) vehicleId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.telematics.liveVehicle(user.organizationId, vehicleId);
  }

  @Roles(...OPS)
  @Get("vehicles/:vehicleId/eta")
  eta(
    @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
    @Query() query: EtaQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.telematics.estimateEta(user.organizationId, vehicleId, { latitude: query.lat, longitude: query.lng });
  }

  @Roles(...OPS)
  @Get("vehicles/:vehicleId/playback")
  playback(
    @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
    @Query() query: PlaybackQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.telematics.historicalPlayback(user.organizationId, vehicleId, { from: query.from, to: query.to, limit: query.limit });
  }

  /// Staff hand-entry / first-party integration for a specific vehicle.
  @Roles(...OPS)
  @Post("vehicles/:vehicleId/positions")
  ingestForVehicle(
    @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
    @Body() dto: IngestPositionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ingestion.ingestForVehicle(
      { organizationId: user.organizationId, vehicleId },
      dto.positions.map(normalizeIngestDto),
    );
  }

  /// A signed-in driver posting their own location. The vehicle is resolved
  /// from the driver's active dispatch server-side — the driver never names one.
  @Roles("DRIVER")
  @Post("my-location")
  ingestMyLocation(@Body() dto: IngestPositionsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ingestion.ingestForDriver(user.organizationId, user.userId, dto.positions.map(normalizeIngestDto));
  }
}
