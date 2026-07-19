import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { ListTripsQueryDto } from "./dto/list-trips-query.dto";
import { TripReplayQueryDto } from "./dto/trip-replay-query.dto";
import { TripService } from "./trips/trip.service";

const OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("telematics/trips")
export class TripsController {
  constructor(private readonly trips: TripService) {}

  @Roles(...OPS)
  @Get()
  list(@Query() query: ListTripsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.trips.list(user.organizationId, query);
  }

  @Roles(...OPS)
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.trips.getById(user.organizationId, id);
  }

  @Roles(...OPS)
  @Get(":id/replay")
  replay(@Param("id", ParseUUIDPipe) id: string, @Query() query: TripReplayQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.trips.replay(user.organizationId, id, query);
  }
}
