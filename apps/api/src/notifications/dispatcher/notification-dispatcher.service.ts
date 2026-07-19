import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel, NotificationCategory } from '@prisma/client';
import { TemplateService } from '../templates/template.service';
import { DeliveryQueueService } from '../queue/delivery-queue.service';
import { PreferencesService } from '../preferences/preferences.service';
import { WorkflowEventService } from '../../workflows/triggers/workflow-event.service';

export interface DispatchNotificationRequest {
  organizationId: string;
  notificationId: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private prisma: PrismaService,
    private templateService: TemplateService,
    private deliveryQueue: DeliveryQueueService,
    private preferencesService: PreferencesService,
    @Inject(forwardRef(() => WorkflowEventService))
    private workflowEvents: WorkflowEventService,
  ) {}

  async dispatch(request: DispatchNotificationRequest): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: request.notificationId },
    });

    if (!notification) {
      this.logger.error(
        `Notification ${request.notificationId} not found for dispatch`,
      );
      return;
    }

    const users = await this.getTargetUsers(
      request.organizationId,
      request.category,
    );

    if (users.length === 0) {
      this.logger.warn(
        `No users found for notification ${request.notificationId} in category ${request.category}`,
      );
      return;
    }

    const channels = [
      NotificationChannel.IN_APP,
      NotificationChannel.EMAIL,
    ];

    for (const user of users) {
      for (const channel of channels) {
        const shouldDeliver = await this.preferencesService.shouldDeliverToChannel(
          user.id,
          channel,
          request.category,
        );

        if (!shouldDeliver) {
          continue;
        }

        if (channel === NotificationChannel.IN_APP) {
          continue;
        }

        const templateKey = this.normalizeTemplateKey(request.type);
        const variables = this.extractVariables(request);

        const rendered = await this.templateService.render({
          organizationId: request.organizationId,
          templateKey,
          channel,
          variables,
        });

        if (!rendered) {
          this.logger.warn(
            `No template found for ${templateKey} / ${channel}, skipping dispatch`,
          );
          continue;
        }

        await this.deliveryQueue.enqueue({
          organizationId: request.organizationId,
          notificationId: request.notificationId,
          userId: user.id,
          channel,
          payload: {
            to: user.email,
            subject: rendered.subject,
            body: rendered.bodyHtml || rendered.bodyText,
            metadata: {
              templateKey,
              variables,
            },
          },
        });
      }
    }

    this.logger.log(
      `Dispatched notification ${request.notificationId} to ${users.length} users across ${channels.length} channels`,
    );

    void this.workflowEvents.emit(
      request.organizationId,
      'notification.dispatched',
      {
        notificationId: request.notificationId,
        type: request.type,
        category: request.category,
        title: request.title,
        userCount: users.length,
      },
    );
  }

  private async getTargetUsers(
    organizationId: string,
    category: NotificationCategory,
  ) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      include: {
        user: true,
      },
    });

    return memberships
      .filter((m) => {
        const allowedCategories = this.categoriesForRole(m.role);
        return allowedCategories.includes(category);
      })
      .map((m) => m.user);
  }

  private categoriesForRole(role: string): NotificationCategory[] {
    switch (role) {
      case 'ADMIN':
        return [
          NotificationCategory.OPERATIONS,
          NotificationCategory.FINANCE,
          NotificationCategory.CUSTOMERS,
          NotificationCategory.FLEET,
        ];
      case 'OPERATIONS_MANAGER':
        return [
          NotificationCategory.OPERATIONS,
          NotificationCategory.CUSTOMERS,
          NotificationCategory.FLEET,
        ];
      case 'DISPATCHER':
        return [NotificationCategory.OPERATIONS, NotificationCategory.FLEET];
      case 'ACCOUNTANT':
        return [NotificationCategory.FINANCE, NotificationCategory.CUSTOMERS];
      case 'SALES_CRM_MANAGER':
        return [NotificationCategory.CUSTOMERS];
      default:
        return [];
    }
  }

  private normalizeTemplateKey(type: string): string {
    return type.toLowerCase();
  }

  private extractVariables(
    request: DispatchNotificationRequest,
  ): Record<string, any> {
    return {
      title: request.title,
      message: request.message,
      entityType: request.entityType || '',
      entityId: request.entityId || '',
      ...(request.metadata || {}),
    };
  }
}
