import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { UpdateNotificationSettingsDto } from "./dto/update-notification-settings.dto";
import { NotificationsService } from "./notifications.service";

/// Every non-DRIVER role can reach these routes — which specific
/// notifications each one actually sees is a row-level category filter
/// inside NotificationsService (see notification-roles.util.ts), not a
/// route-level restriction. DRIVER has no @Roles entry anywhere in this
/// controller, so RolesGuard 403s it on every route, per "DRIVER: no access
/// in this phase."
const ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Roles(...ROLES)
  @Get()
  list(@Query() query: ListNotificationsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.list(user.organizationId, user.role, query);
  }

  @Roles(...ROLES)
  @Get("unread-count")
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.unreadCount(user.organizationId, user.role);
  }

  @Roles("ADMIN")
  @Get("settings")
  getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getSettings(user.organizationId);
  }

  @Roles("ADMIN")
  @Patch("settings")
  updateSettings(@Body() dto: UpdateNotificationSettingsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.updateSettings(user.organizationId, dto);
  }

  @Roles(...ROLES)
  @Post("read-all")
  @HttpCode(200)
  readAll(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.readAll(user.organizationId, user.role);
  }

  @Roles(...ROLES)
  @Post("archive-all")
  @HttpCode(200)
  archiveAll(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.archiveAll(user.organizationId, user.role);
  }

  @Roles(...ROLES)
  @Post(":id/read")
  @HttpCode(200)
  markRead(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markRead(user.organizationId, user.role, id);
  }

  @Roles(...ROLES)
  @Post(":id/unread")
  @HttpCode(200)
  markUnread(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markUnread(user.organizationId, user.role, id);
  }

  @Roles(...ROLES)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.archive(user.organizationId, user.role, id);
  }
}
