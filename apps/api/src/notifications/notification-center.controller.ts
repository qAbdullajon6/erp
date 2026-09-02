import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { MembershipRole, NotificationCategory, Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/interfaces/current-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PreferencesService } from './preferences/preferences.service';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto, BulkNotificationActionDto, UpdatePreferencesDto } from './dto/notification-center.dto';
import { categoriesForRole } from './notification-roles.util';

/// Same staff roles as NotificationsController — DRIVER is blocked at the
/// guard, and category ACL further scopes which rows each role can see/mutate.
const ROLES: MembershipRole[] = [
  'ADMIN',
  'OPERATIONS_MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'SALES_CRM_MANAGER',
];

@Controller('notification-center')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES)
export class NotificationCenterController {
  constructor(
    private prisma: PrismaService,
    private preferencesService: PreferencesService,
    private notificationsService: NotificationsService,
  ) {}

  @Get('notifications')
  async listNotifications(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: NotificationQueryDto,
  ) {
    // Keep rule-based alerts (expiry, due invoices, etc.) in sync even when
    // operators only open the full-page center and never the bell dropdown.
    await this.notificationsService.refresh(user.organizationId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    const where: Prisma.NotificationWhereInput = {
      organizationId: user.organizationId,
      category: this.resolveCategoryFilter(user.role, query.category),
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { message: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    if (query.isArchived !== undefined) {
      where.isArchived = query.isArchived;
    } else {
      where.isArchived = false;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @Get('notifications/unread-count')
  async getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    await this.notificationsService.refresh(user.organizationId);
    const allowedCategories = categoriesForRole(user.role);

    const count = await this.prisma.notification.count({
      where: {
        organizationId: user.organizationId,
        category: { in: allowedCategories },
        isRead: false,
        isArchived: false,
      },
    });

    return { count };
  }

  @Post('notifications/:id/read')
  async markAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.findVisibleOrThrow(user.organizationId, user.role, id);
    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  @Post('notifications/:id/unread')
  async markAsUnread(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.findVisibleOrThrow(user.organizationId, user.role, id);
    await this.prisma.notification.update({
      where: { id },
      data: { isRead: false, readAt: null },
    });
    return { success: true };
  }

  @Post('notifications/:id/archive')
  async archiveNotification(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.findVisibleOrThrow(user.organizationId, user.role, id);
    // dismissedAt (not just isArchived) tells the reconcile loop this was a
    // user dismissal, not a resolved condition — see NotificationsService's
    // reconcileRule. Without it, archiving a still-qualifying rule-based
    // notification gets undone by the very next refresh.
    await this.prisma.notification.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date(), dismissedAt: new Date() },
    });
    return { success: true };
  }

  @Delete('notifications/:id')
  async deleteNotification(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.findVisibleOrThrow(user.organizationId, user.role, id);
    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  @Post('notifications/bulk-read')
  async bulkMarkAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: BulkNotificationActionDto,
  ) {
    const allowedCategories = categoriesForRole(user.role);
    await this.prisma.notification.updateMany({
      where: {
        id: { in: body.notificationIds },
        organizationId: user.organizationId,
        category: { in: allowedCategories },
      },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  @Post('notifications/bulk-archive')
  async bulkArchive(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: BulkNotificationActionDto,
  ) {
    const allowedCategories = categoriesForRole(user.role);
    await this.prisma.notification.updateMany({
      where: {
        id: { in: body.notificationIds },
        organizationId: user.organizationId,
        category: { in: allowedCategories },
      },
      data: { isArchived: true, archivedAt: new Date(), dismissedAt: new Date() },
    });
    return { success: true };
  }

  @Post('notifications/mark-all-read')
  async markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    const allowedCategories = categoriesForRole(user.role);
    await this.prisma.notification.updateMany({
      where: {
        organizationId: user.organizationId,
        category: { in: allowedCategories },
        isRead: false,
        isArchived: false,
      },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: CurrentUserPayload) {
    return this.preferencesService.getPreferences(user.userId);
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updates: UpdatePreferencesDto,
  ) {
    return this.preferencesService.updatePreferences(user.userId, updates);
  }

  /// Intersect (never overwrite) role ACL with an optional client filter.
  /// Requesting a category outside the caller's role is a hard 403 — returning
  /// empty would hide a privilege-escalation attempt as "no results."
  private resolveCategoryFilter(
    role: MembershipRole,
    queryCategory?: NotificationCategory,
  ): NotificationCategory | { in: NotificationCategory[] } {
    const allowed = categoriesForRole(role);
    if (!queryCategory) {
      return { in: allowed };
    }
    if (!allowed.includes(queryCategory)) {
      throw new ForbiddenException('Category not allowed for your role');
    }
    return queryCategory;
  }

  private async findVisibleOrThrow(
    organizationId: string,
    role: MembershipRole,
    id: string,
  ) {
    const allowedCategories = categoriesForRole(role);
    const notification = await this.prisma.notification.findFirst({
      where: { id, organizationId, category: { in: allowedCategories } },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }
}
