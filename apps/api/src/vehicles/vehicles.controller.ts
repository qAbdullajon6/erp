import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { ListVehiclesQueryDto } from "./dto/list-vehicles-query.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import { VehiclesService } from "./vehicles.service";

/// Same role scoping as DriversController — see its comment.
const ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Roles(...ROLES)
  @Get()
  list(@Query() query: ListVehiclesQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.vehiclesService.list(user.organizationId, query);
  }

  @Roles(...ROLES)
  @Post()
  create(@Body() dto: CreateVehicleDto, @CurrentUser() user: CurrentUserPayload) {
    return this.vehiclesService.create(user.organizationId, dto, user);
  }

  @Roles(...ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.vehiclesService.getById(user.organizationId, id);
  }

  @Roles(...ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.vehiclesService.update(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.vehiclesService.archive(user.organizationId, id, user);
  }

  @Roles(...ROLES)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.vehiclesService.restore(user.organizationId, id, user);
  }
}
