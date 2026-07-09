import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { DriversService } from "./drivers.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { ListDriversQueryDto } from "./dto/list-drivers-query.dto";
import { UpdateDriverDto } from "./dto/update-driver.dto";

/// Fleet management (Drivers/Vehicles) is scoped, per the Orders + Dispatch
/// phase spec, to ADMIN/OPERATIONS_MANAGER/DISPATCHER only — SALES_CRM_MANAGER
/// is explicitly barred from "managing fleet," and ACCOUNTANT's stated scope
/// is "orders and dispatch," not fleet records. Both get 403 here, same as
/// DRIVER (no @Roles entry needed beyond this shared set).
const ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("drivers")
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Roles(...ROLES)
  @Get()
  list(@Query() query: ListDriversQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.list(user.organizationId, query);
  }

  /// Must stay declared before the `:id` route below — Nest matches path
  /// segments in declaration order, so `:id` would otherwise swallow `/me`.
  @Roles("DRIVER")
  @Get("me")
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.driversService.getMe(user.organizationId, user.userId);
  }

  @Roles(...ROLES)
  @Post()
  create(@Body() dto: CreateDriverDto, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.create(user.organizationId, dto, user);
  }

  @Roles(...ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.getById(user.organizationId, id);
  }

  @Roles(...ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.driversService.update(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.archive(user.organizationId, id, user);
  }

  @Roles(...ROLES)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.restore(user.organizationId, id, user);
  }
}
