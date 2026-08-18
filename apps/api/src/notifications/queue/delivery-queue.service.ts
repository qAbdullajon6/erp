import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationChannel,
  DeliveryStatus,
  NotificationDeliveryQueue,
  Prisma,
} from '@prisma/client';
import { EmailService } from '../email/email.service';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface EnqueueRequest {
  organizationId: string;
  notificationId?: string;
  userId: string;
  channel: NotificationChannel;
  priority?: number;
  scheduledFor?: Date;
  payload: DeliveryQueuePayload;
}

export interface DeliveryQueuePayload {
  to: string;
  subject?: string;
  body: string;
  metadata: {
    templateKey: string;
    variables: Record<string, unknown>;
  };
}

function parseDeliveryQueuePayload(payload: Prisma.JsonValue): DeliveryQueuePayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return {
      to: '',
      body: '',
      metadata: { templateKey: '', variables: {} },
    };
  }

  const record = payload as Record<string, unknown>;
  const metadataRaw = record.metadata;
  let metadata: DeliveryQueuePayload['metadata'] = {
    templateKey: '',
    variables: {},
  };

  if (
    typeof metadataRaw === 'object' &&
    metadataRaw !== null &&
    !Array.isArray(metadataRaw)
  ) {
    const metadataRecord = metadataRaw as Record<string, unknown>;
    const variablesRaw = metadataRecord.variables;
    metadata = {
      templateKey:
        typeof metadataRecord.templateKey === 'string'
          ? metadataRecord.templateKey
          : '',
      variables:
        typeof variablesRaw === 'object' &&
        variablesRaw !== null &&
        !Array.isArray(variablesRaw)
          ? (variablesRaw as Record<string, unknown>)
          : {},
    };
  }

  return {
    to: typeof record.to === 'string' ? record.to : '',
    subject: typeof record.subject === 'string' ? record.subject : undefined,
    body: typeof record.body === 'string' ? record.body : '',
    metadata,
  };
}

@Injectable()
export class DeliveryQueueService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryQueueService.name);
  private isProcessing = false;
  private readonly BATCH_SIZE = 100;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [30000, 120000, 600000];

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  onModuleInit() {
    this.logger.log('Delivery queue service initialized');
  }

  async enqueue(request: EnqueueRequest): Promise<string> {
    const queueItem = await this.prisma.notificationDeliveryQueue.create({
      data: {
        organizationId: request.organizationId,
        notificationId: request.notificationId,
        userId: request.userId,
        channel: request.channel,
        priority: request.priority || 5,
        scheduledFor: request.scheduledFor || new Date(),
        payload: request.payload as unknown as Prisma.InputJsonValue,
        maxAttempts: this.MAX_ATTEMPTS,
      },
    });

    this.logger.log(
      `Enqueued ${request.channel} delivery for user ${request.userId} (id: ${queueItem.id})`,
    );

    return queueItem.id;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error(
        `Error processing queue batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async processBatch() {
    const items = await this.prisma.notificationDeliveryQueue.findMany({
      where: {
        status: DeliveryStatus.PENDING,
        scheduledFor: { lte: new Date() },
      },
      orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }],
      take: this.BATCH_SIZE,
    });

    if (items.length === 0) {
      return;
    }

    this.logger.log(`Processing ${items.length} delivery queue items`);

    await Promise.all(items.map((item) => this.processItem(item)));
  }

  private async processItem(item: NotificationDeliveryQueue) {
    const payload = parseDeliveryQueuePayload(item.payload);

    await this.prisma.notificationDeliveryQueue.update({
      where: { id: item.id },
      data: { status: DeliveryStatus.SENDING },
    });

    try {
      let success = false;
      let error: string | undefined;

      switch (item.channel) {
        case NotificationChannel.EMAIL: {
          const emailResult = await this.emailService.send({
            organizationId: item.organizationId,
            to: payload.to,
            subject: payload.subject || 'Notification',
            text: payload.body,
            html: payload.body,
          });
          success = emailResult.success;
          error = emailResult.error;
          break;
        }

        case NotificationChannel.IN_APP:
          success = true;
          break;

        case NotificationChannel.SMS:
        case NotificationChannel.PUSH:
        case NotificationChannel.WEBHOOK:
          this.logger.warn(`Channel ${item.channel} not yet implemented`);
          error = `${item.channel} delivery not implemented`;
          break;
      }

      if (success) {
        await this.prisma.notificationDeliveryQueue.update({
          where: { id: item.id },
          data: {
            status: DeliveryStatus.SENT,
            sentAt: new Date(),
          },
        });

        if (item.channel === NotificationChannel.EMAIL) {
          await this.prisma.emailTracking.create({
            data: {
              deliveryQueueId: item.id,
            },
          });
        }

        this.logger.log(`Successfully delivered ${item.channel} to ${payload.to}`);
      } else {
        await this.handleFailure(item, error || 'Unknown error');
      }
    } catch (error) {
      await this.handleFailure(
        item,
        error instanceof Error ? error.message : 'Unexpected error',
      );
    }
  }

  private async handleFailure(item: NotificationDeliveryQueue, error: string) {
    const attempts = item.attempts + 1;

    if (attempts >= item.maxAttempts) {
      await this.prisma.notificationDeliveryQueue.update({
        where: { id: item.id },
        data: {
          status: DeliveryStatus.DEAD_LETTER,
          attempts,
          lastError: error,
        },
      });
      this.logger.error(
        `Delivery ${item.id} moved to dead letter queue after ${attempts} attempts: ${error}`,
      );
    } else {
      const retryDelay = this.RETRY_DELAYS[attempts - 1] || 600000;
      const scheduledFor = new Date(Date.now() + retryDelay);

      await this.prisma.notificationDeliveryQueue.update({
        where: { id: item.id },
        data: {
          status: DeliveryStatus.PENDING,
          attempts,
          lastError: error,
          scheduledFor,
        },
      });

      this.logger.warn(
        `Delivery ${item.id} rescheduled after attempt ${attempts}: ${error}`,
      );
    }
  }

  async getQueueStats(organizationId: string) {
    const stats = await this.prisma.notificationDeliveryQueue.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: true,
    });

    return stats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
