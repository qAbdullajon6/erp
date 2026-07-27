import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { TrackingSessionSource } from "@prisma/client";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from "class-validator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { PrismaService } from "../../prisma/prisma.service";
import { TrackingService } from "./tracking.service";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

class SimulateVehicleDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(400)
  speedKph?: number;
}

class SimulateDispatchFinishDto {
  @IsUUID()
  dispatchId!: string;

  @IsOptional()
  @IsIn(["DELIVERED", "CANCELLED"])
  mode?: "DELIVERED" | "CANCELLED";
}

/// Development-only GPS simulator for Fleet Tracking Phase 10.
/// Registered only when NODE_ENV=development (see trackingDevImports).
///
/// These routes never invent production telemetry — they call the same
/// TrackingService receive / session-end paths the Driver Mobile App uses.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPS)
@Controller("tracking/dev")
export class TrackingDevController {
  constructor(
    private readonly tracking: TrackingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("simulate/movement")
  async simulateMovement(@Body() dto: SimulateVehicleDto, @CurrentUser() user: CurrentUserPayload) {
    const base = await this.resolveBase(user.organizationId, dto);
    return this.tracking.receiveForVehicle(
      user.organizationId,
      dto.vehicleId,
      [
        {
          recordedAt: new Date(),
          latitude: base.latitude + 0.0003,
          longitude: base.longitude + 0.0003,
          speedKph: dto.speedKph ?? 42,
          heading: 90,
          altitudeM: null,
          accuracyM: 8,
          ignitionOn: true,
          odometerKm: null,
          fuelLevelPct: null,
          satellites: 10,
          raw: { simulated: "movement" },
        },
      ],
      { source: TrackingSessionSource.API },
    );
  }

  @Post("simulate/stop")
  async simulateStop(@Body() dto: SimulateVehicleDto, @CurrentUser() user: CurrentUserPayload) {
    const base = await this.resolveBase(user.organizationId, dto);
    return this.tracking.receiveForVehicle(
      user.organizationId,
      dto.vehicleId,
      [
        {
          recordedAt: new Date(),
          latitude: base.latitude,
          longitude: base.longitude,
          speedKph: 0,
          heading: base.heading,
          altitudeM: null,
          accuracyM: 8,
          ignitionOn: true,
          odometerKm: null,
          fuelLevelPct: null,
          satellites: 10,
          raw: { simulated: "stop" },
        },
      ],
      { source: TrackingSessionSource.API },
    );
  }

  @Post("simulate/offline")
  async simulateOffline(@Body() dto: SimulateVehicleDto, @CurrentUser() user: CurrentUserPayload) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    const state = await this.prisma.vehicleTelematicsState.findFirst({
      where: { organizationId: user.organizationId, vehicleId: dto.vehicleId },
    });
    if (!state) {
      throw new BadRequestException("Vehicle has no telematics state to mark offline");
    }

    // Backdate lastReceivedAt past the offline threshold so the next sweeper
    // (or an immediate state mark) treats the vehicle as offline — no fake GPS.
    const settings = await this.prisma.telematicsSettings.findUnique({
      where: { organizationId: user.organizationId },
    });
    const thresholdSec = settings?.offlineThresholdSec ?? 600;
    const staleAt = new Date(Date.now() - (thresholdSec + 30) * 1000);

    await this.prisma.vehicleTelematicsState.update({
      where: { vehicleId: dto.vehicleId },
      data: { lastReceivedAt: staleAt, movementState: "OFFLINE" },
    });

    const sessions = await this.prisma.trackingSession.findMany({
      where: {
        organizationId: user.organizationId,
        vehicleId: dto.vehicleId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    for (const s of sessions) {
      await this.prisma.trackingSession.update({
        where: { id: s.id },
        data: { lastHeartbeatAt: staleAt },
      });
    }

    return {
      vehicleId: dto.vehicleId,
      simulated: "offline",
      lastReceivedAt: staleAt.toISOString(),
      sessionsStaled: sessions.length,
    };
  }

  @Post("simulate/reconnect")
  async simulateReconnect(@Body() dto: SimulateVehicleDto, @CurrentUser() user: CurrentUserPayload) {
    const base = await this.resolveBase(user.organizationId, dto);
    return this.tracking.receiveForVehicle(
      user.organizationId,
      dto.vehicleId,
      [
        {
          recordedAt: new Date(),
          latitude: base.latitude,
          longitude: base.longitude,
          speedKph: dto.speedKph ?? 15,
          heading: base.heading,
          altitudeM: null,
          accuracyM: 10,
          ignitionOn: true,
          odometerKm: null,
          fuelLevelPct: null,
          satellites: 9,
          raw: { simulated: "reconnect" },
        },
      ],
      { source: TrackingSessionSource.API },
    );
  }

  @Post("simulate/dispatch-finish")
  async simulateDispatchFinish(
    @Body() dto: SimulateDispatchFinishDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const dispatch = await this.prisma.dispatch.findFirst({
      where: { id: dto.dispatchId, organizationId: user.organizationId },
      select: { id: true, status: true },
    });
    if (!dispatch) throw new NotFoundException("Dispatch not found");

    // Dev tool only ends tracking sessions — it does not mutate dispatch status
    // (that stays on the real dispatch API so ADR-001 stays intact).
    const ended = await this.tracking.endSessionsForDispatch(user.organizationId, dto.dispatchId);
    return {
      dispatchId: dto.dispatchId,
      dispatchStatus: dispatch.status,
      sessionsEnded: ended,
      note: "Tracking sessions closed only. Transition the dispatch via /dispatches if needed.",
    };
  }

  private async resolveBase(
    organizationId: string,
    dto: SimulateVehicleDto,
  ): Promise<{ latitude: number; longitude: number; heading: number | null }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException("Vehicle not found");

    if (dto.latitude != null && dto.longitude != null) {
      return { latitude: dto.latitude, longitude: dto.longitude, heading: null };
    }

    const state = await this.prisma.vehicleTelematicsState.findFirst({
      where: { organizationId, vehicleId: dto.vehicleId },
      select: { latitude: true, longitude: true, heading: true },
    });
    if (state?.latitude != null && state?.longitude != null) {
      return {
        latitude: state.latitude,
        longitude: state.longitude,
        heading: state.heading,
      };
    }

    // Seed point when the vehicle has never reported — Tashkent CBD area as a
    // stable, non-null-island default for local simulations only.
    return { latitude: 41.3111, longitude: 69.2797, heading: 0 };
  }
}
