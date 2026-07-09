import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { DispatchesService } from "./dispatches.service";
import { CreateDispatchDto } from "./dto/create-dispatch.dto";
import { ListDispatchesQueryDto } from "./dto/list-dispatches-query.dto";
import { UpdateDispatchDto } from "./dto/update-dispatch.dto";
import { UpdateDispatchStatusDto } from "./dto/update-dispatch-status.dto";

/// "ACCOUNTANT: read-only orders and dispatch" per the phase spec;
/// DISPATCHER gets full create/manage access.
const ROLES_READ: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];
const ROLES_WRITE: MembershipRole[] = ["ADMIN", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dispatches")
export class DispatchesController {
  constructor(private readonly dispatchesService: DispatchesService) {}

  @Roles(...ROLES_READ)
  @Get()
  list(
    @Query() query: ListDispatchesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.list(user.organizationId, query);
  }

  @Roles(...ROLES_READ)
  @Get(":id")
  getById(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.getById(user.organizationId, id);
  }

  @Roles(...ROLES_WRITE)
  @Post()
  create(
    @Body() dto: CreateDispatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.create(user.organizationId, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.update(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.updateStatus(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/cancel")
  cancel(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.dispatchesService.cancel(user.organizationId, id, user);
  }
}
