import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Roles } from "../../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { TrackingDebugBufferService } from "./tracking-debug-buffer.service";
import { TrackingDebugService } from "./tracking-debug.service";

const ADMIN_OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

class DebugLimitQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/// Fleet Tracking Phase 11 — Observability & Testing Console API.
/// Registered only when NODE_ENV=development (see telematics.module.ts).
/// Roles match Devices / settings: ADMIN + OPERATIONS_MANAGER (no DISPATCHER).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_OPS)
@Controller("tracking/debug")
export class TrackingDebugController {
  constructor(
    private readonly debug: TrackingDebugService,
    private readonly buffer: TrackingDebugBufferService,
  ) {}

  @Get("snapshot")
  snapshot(@CurrentUser() user: CurrentUserPayload) {
    return this.debug.snapshot(user.organizationId);
  }

  @Get("packets")
  packets(@Query() query: DebugLimitQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return {
      packets: this.buffer.listPackets(user.organizationId, query.limit ?? 100),
    };
  }

  @Get("timeline")
  async timeline(@CurrentUser() user: CurrentUserPayload) {
    const snap = await this.debug.snapshot(user.organizationId);
    return { timeline: snap.timeline };
  }

  @Get("diagnostics")
  async diagnostics(@CurrentUser() user: CurrentUserPayload) {
    const snap = await this.debug.snapshot(user.organizationId);
    return { diagnostics: snap.diagnostics, metrics: snap.metrics };
  }

  @Get("metrics")
  async metrics(@CurrentUser() user: CurrentUserPayload) {
    const snap = await this.debug.snapshot(user.organizationId);
    return snap.metrics;
  }

  @Get("export")
  exportJson(@CurrentUser() user: CurrentUserPayload) {
    return this.debug.exportJson(user.organizationId);
  }
}
