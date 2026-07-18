import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CreateGeofenceDto } from "./dto/create-geofence.dto";
import { ListGeofencesQueryDto } from "./dto/list-geofences-query.dto";
import { UpdateGeofenceDto } from "./dto/update-geofence.dto";
import { GeofenceService } from "./geofences/geofence.service";
import { GeofenceEventService } from "./geofences/geofence-event.service";
import { ListGeofenceEventsQueryDto } from "./dto/list-geofence-events-query.dto";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];
/// Creating/deleting fences is a fleet-configuration action — admins and ops
/// managers, not every dispatcher.
const ADMIN_OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("telematics/geofences")
export class GeofencesController {
  constructor(
    private readonly geofences: GeofenceService,
    private readonly events: GeofenceEventService,
  ) {}

  @Roles(...OPS)
  @Get()
  list(@Query() query: ListGeofencesQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.geofences.list(user.organizationId, query);
  }

  // Declared before ":id" so the literal path wins the match.
  @Roles(...OPS)
  @Get("events")
  listEvents(@Query() query: ListGeofenceEventsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.events.list(user.organizationId, query);
  }

  @Roles(...ADMIN_OPS)
  @Post()
  create(@Body() dto: CreateGeofenceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.geofences.create(user.organizationId, dto, user);
  }

  @Roles(...OPS)
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.geofences.getById(user.organizationId, id);
  }

  @Roles(...ADMIN_OPS)
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateGeofenceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.geofences.update(user.organizationId, id, dto, user);
  }

  @Roles(...ADMIN_OPS)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.geofences.archive(user.organizationId, id, user);
  }

  @Roles(...ADMIN_OPS)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.geofences.restore(user.organizationId, id, user);
  }
}
