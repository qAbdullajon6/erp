import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { SubscriptionStatus } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";

class ListSubscriptionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

class UpdateSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;
}

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/subscriptions")
export class PlatformSubscriptionsController {
  constructor(private readonly subscriptions: PlatformSubscriptionsService) {}

  @Get()
  list(@Query() query: ListSubscriptionsQueryDto) {
    return this.subscriptions.list(query.page ?? 1, query.limit ?? 20, query.status);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateSubscriptionStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.subscriptions.updateStatus(id, dto.status, user);
  }
}
