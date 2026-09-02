import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { MembershipRole } from "@prisma/client";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import { DriversService, MAX_PHOTO_BYTES } from "./drivers.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { LinkDriverUserDto } from "./dto/link-driver-user.dto";
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

  /// GET /drivers/me lives on DriverMeController (workspace profile + breaks/POD config).

  @Roles(...ROLES)
  @Post()
  create(@Body() dto: CreateDriverDto, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.create(user.organizationId, dto, user);
  }

  @Roles(...ROLES)
  @Get(":id")
  getById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.getById(user.organizationId, id);
  }

  @Roles(...ROLES)
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.driversService.update(user.organizationId, id, dto, user);
  }

  @Roles(...ROLES)
  @Post(":id/link-user")
  @HttpCode(200)
  linkUser(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LinkDriverUserDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.driversService.linkUser(user.organizationId, id, dto.userId, user);
  }

  @Roles(...ROLES)
  @Post(":id/unlink-user")
  @HttpCode(200)
  unlinkUser(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.unlinkUser(user.organizationId, id, user);
  }

  @Roles(...ROLES)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.archive(user.organizationId, id, user);
  }

  @Roles(...ROLES)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.restore(user.organizationId, id, user);
  }

  @Roles(...ROLES)
  @Post(":id/photo")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES } }))
  uploadPhoto(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.driversService.uploadPhoto(user.organizationId, id, file, user);
  }

  @Roles(...ROLES)
  @Delete(":id/photo")
  @HttpCode(200)
  removePhoto(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.driversService.removePhoto(user.organizationId, id, user);
  }

  @Roles(...ROLES)
  @Get(":id/photo/file")
  @RawResponse()
  async servePhoto(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const { mimeType, stream } = await this.driversService.servePhoto(user.organizationId, id);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.pipe(res);
  }
}
