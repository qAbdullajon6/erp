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
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PreferencesService } from './preferences/preferences.service';
import { NotificationQueryDto, BulkNotificationActionDto, UpdatePreferencesDto } from './dto/notification-center.dto';
import { categoriesForRole } from './notification-roles.util';

@Controller('notification-center')
@UseGuards(JwtAuthGuard)
export class NotificationCenterController {
  constructor(
    private prisma: PrismaService,
    private preferencesService: PreferencesService,
  ) {}

  @Get('notifications')
  async listNotifications(@Req() req: any, @Query() query: NotificationQueryDto) {
    const userId = req.user.sub;
    const organizationId = req.user.organizationId;
    const role = req.user.role;

    const allowedCategories = categoriesForRole(role);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      category: { in: allowedCategories },
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { message: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = query.category;
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
        orderBy: { createdAt: 'desc' },
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
  async getUnreadCount(@Req() req: any) {
    const organizationId = req.user.organizationId;
    const role = req.user.role;
    const allowedCategories = categoriesForRole(role);

    const count = await this.prisma.notification.count({
      where: {
        organizationId,
        category: { in: allowedCategories },
        isRead: false,
        isArchived: false,
      },
    });

    return { count };
  }

  @Post('notifications/:id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId;

    await this.prisma.notification.update({
      where: { id, organizationId },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  @Post('notifications/:id/unread')
  async markAsUnread(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId;

    await this.prisma.notification.update({
      where: { id, organizationId },
      data: { isRead: false, readAt: null },
    });

    return { success: true };
  }

  @Post('notifications/:id/archive')
  async archiveNotification(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId;

    await this.prisma.notification.update({
      where: { id, organizationId },
      data: { isArchived: true, archivedAt: new Date() },
    });

    return { success: true };
  }

  @Delete('notifications/:id')
  async deleteNotification(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId;

    await this.prisma.notification.delete({
      where: { id, organizationId },
    });

    return { success: true };
  }

  @Post('notifications/bulk-read')
  async bulkMarkAsRead(@Req() req: any, @Body() body: BulkNotificationActionDto) {
    const organizationId = req.user.organizationId;

    await this.prisma.notification.updateMany({
      where: {
        id: { in: body.notificationIds },
        organizationId,
      },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  @Post('notifications/bulk-archive')
  async bulkArchive(@Req() req: any, @Body() body: BulkNotificationActionDto) {
    const organizationId = req.user.organizationId;

    await this.prisma.notification.updateMany({
      where: {
        id: { in: body.notificationIds },
        organizationId,
      },
      data: { isArchived: true, archivedAt: new Date() },
    });

    return { success: true };
  }

  @Post('notifications/mark-all-read')
  async markAllAsRead(@Req() req: any) {
    const organizationId = req.user.organizationId;
    const role = req.user.role;
    const allowedCategories = categoriesForRole(role);

    await this.prisma.notification.updateMany({
      where: {
        organizationId,
        category: { in: allowedCategories },
        isRead: false,
        isArchived: false,
      },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const userId = req.user.sub;
    return this.preferencesService.getPreferences(userId);
  }

  @Patch('preferences')
  async updatePreferences(@Req() req: any, @Body() updates: UpdatePreferencesDto) {
    const userId = req.user.sub;
    return this.preferencesService.updatePreferences(userId, updates);
  }
}
