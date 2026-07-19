import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AlertService } from "./alerts/alert.service";
import { ListAlertsQueryDto } from "./dto/list-alerts-query.dto";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("telematics/alerts")
export class TelematicsAlertsController {
  constructor(private readonly alerts: AlertService) {}

  @Roles(...OPS)
  @Get()
  list(@Query() query: ListAlertsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.alerts.list(user.organizationId, query);
  }

  @Roles(...OPS)
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.alerts.getById(user.organizationId, id);
  }

  @Roles(...OPS)
  @Post(":id/acknowledge")
  @HttpCode(200)
  acknowledge(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.alerts.acknowledge(user.organizationId, id, user);
  }

  @Roles(...OPS)
  @Post(":id/resolve")
  @HttpCode(200)
  resolve(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.alerts.resolve(user.organizationId, id, user);
  }
}
