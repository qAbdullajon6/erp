import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { IsISO8601, IsOptional } from "class-validator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { UsageService } from "./usage.service";

const USAGE_READ_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

/// Date-only bounds (YYYY-MM-DD), as sent by the Usage tab's date inputs.
/// Validated so a malformed value fails at the boundary rather than becoming
/// an Invalid Date that silently widens the query to everything.
export class UsageQueryDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

@Controller("admin/usage")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...USAGE_READ_ROLES)
export class UsageController {
  constructor(private readonly service: UsageService) {}

  @Get()
  getStats(@CurrentUser() user: CurrentUserPayload, @Query() query: UsageQueryDto) {
    return this.service.getStats(user.organizationId, query.startDate, query.endDate);
  }
}
