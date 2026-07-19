import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { DeviceService } from "./devices/device.service";
import { CreateDeviceDto } from "./dto/create-device.dto";
import { ListDevicesQueryDto } from "./dto/list-devices-query.dto";
import { UpdateDeviceDto } from "./dto/update-device.dto";

/// Device registration and ingest-secret management is a fleet-admin action —
/// it mints credentials, so it is scoped tighter than the read surface.
const ADMIN_OPS: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("telematics/devices")
export class TelematicsDevicesController {
  constructor(private readonly devices: DeviceService) {}

  @Roles(...ADMIN_OPS)
  @Get()
  list(@Query() query: ListDevicesQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.list(user.organizationId, query);
  }

  @Roles(...ADMIN_OPS)
  @Post()
  create(@Body() dto: CreateDeviceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.create(user.organizationId, dto, user);
  }

  @Roles(...ADMIN_OPS)
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.getById(user.organizationId, id);
  }

  @Roles(...ADMIN_OPS)
  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.update(user.organizationId, id, dto, user);
  }

  @Roles(...ADMIN_OPS)
  @Post(":id/rotate-secret")
  @HttpCode(200)
  rotateSecret(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.rotateSecret(user.organizationId, id, user);
  }

  @Roles(...ADMIN_OPS)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.archive(user.organizationId, id, user);
  }

  @Roles(...ADMIN_OPS)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.devices.restore(user.organizationId, id, user);
  }
}
