import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { RoutesService } from "./routes.service";
import { RouteOptimizationService } from "./route-optimization.service";
import { AddRouteStopDto } from "./dto/add-route-stop.dto";
import { ApplyOptimizationDto } from "./dto/apply-optimization.dto";
import { CreateRouteDto } from "./dto/create-route.dto";
import { ListRoutesQueryDto } from "./dto/list-routes-query.dto";
import { ReorderRouteStopsDto } from "./dto/reorder-route-stops.dto";
import { UpdateRouteDto } from "./dto/update-route.dto";
import { UpdateRouteStopDto } from "./dto/update-route-stop.dto";

const ROLES_READ: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT"];
const ROLES_WRITE: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("routes")
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    private readonly optimizationService: RouteOptimizationService,
  ) {}

  @Roles(...ROLES_READ)
  @Get()
  list(
    @Query() query: ListRoutesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.list(user.organizationId, query);
  }

  @Roles(...ROLES_WRITE)
  @Post()
  create(
    @Body() dto: CreateRouteDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.create(user.organizationId, user, dto);
  }

  @Roles(...ROLES_READ)
  @Get(":id")
  getById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.getById(user.organizationId, id);
  }

  @Roles(...ROLES_WRITE)
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.update(user.organizationId, id, dto);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/stops")
  addStop(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddRouteStopDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.addStop(user.organizationId, id, dto);
  }

  @Roles(...ROLES_WRITE)
  @Delete(":id/stops/:stopId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeStop(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("stopId", ParseUUIDPipe) stopId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.removeStop(user.organizationId, id, stopId);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/stops/reorder")
  @HttpCode(HttpStatus.OK)
  reorderStops(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReorderRouteStopsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.reorderStops(user.organizationId, id, dto);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/calculate")
  @HttpCode(HttpStatus.OK)
  calculateRoute(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.calculateRoute(user.organizationId, id);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/optimize/preview")
  @HttpCode(HttpStatus.OK)
  previewOptimization(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.optimizationService.preview(user.organizationId, id);
  }

  @Roles(...ROLES_WRITE)
  @Post(":id/optimize/apply")
  @HttpCode(HttpStatus.OK)
  applyOptimization(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApplyOptimizationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.optimizationService.apply(user.organizationId, id, dto);
  }

  @Roles(...ROLES_WRITE)
  @Patch(":id/stops/:stopId")
  updateStop(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("stopId", ParseUUIDPipe) stopId: string,
    @Body() dto: UpdateRouteStopDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.optimizationService.updateStop(user.organizationId, id, stopId, dto);
  }

  @Roles(...ROLES_WRITE)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.routesService.delete(user.organizationId, id);
  }
}
