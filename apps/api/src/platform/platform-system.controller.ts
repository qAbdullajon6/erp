import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformSystemService } from "./platform-system.service";
import {
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
  UpsertFeatureFlagOverrideDto,
} from "./dto/feature-flag.dto";

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/system")
export class PlatformSystemController {
  constructor(private readonly system: PlatformSystemService) {}

  @Get("health")
  health() {
    return this.system.health();
  }

  @Get("workers")
  workers() {
    return this.system.workers();
  }

  @Get("queues")
  queues() {
    return this.system.queues();
  }

  @Get("feature-flags")
  listFlags() {
    return this.system.listFlags();
  }

  @Post("feature-flags")
  createFlag(@Body() dto: CreateFeatureFlagDto, @CurrentUser() user: CurrentUserPayload) {
    return this.system.createFlag(dto, user);
  }

  @Patch("feature-flags/:id")
  updateFlag(
    @Param("id") id: string,
    @Body() dto: UpdateFeatureFlagDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.system.updateFlag(id, dto, user);
  }

  @Post("feature-flags/:id/overrides")
  upsertOverride(
    @Param("id") id: string,
    @Body() dto: UpsertFeatureFlagOverrideDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.system.upsertOverride(id, dto, user);
  }
}
