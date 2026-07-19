import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel, NotificationCategory } from '@prisma/client';

export interface UserNotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  webhookEnabled: boolean;
  digestMode: boolean;
  digestTime?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  timezone: string;
  categoryPrefs: Record<string, {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    pushEnabled?: boolean;
  }>;
}

export interface UpdatePreferencesRequest {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  pushEnabled?: boolean;
  webhookEnabled?: boolean;
  digestMode?: boolean;
  digestTime?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  timezone?: string;
  categoryPrefs?: Record<string, {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    pushEnabled?: boolean;
  }>;
}

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    let prefs = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await this.prisma.notificationPreferences.create({
        data: {
          userId,
          categoryPrefs: {},
        },
      });
    }

    return {
      emailEnabled: prefs.emailEnabled,
      smsEnabled: prefs.smsEnabled,
      pushEnabled: prefs.pushEnabled,
      webhookEnabled: prefs.webhookEnabled,
      digestMode: prefs.digestMode,
      digestTime: prefs.digestTime || undefined,
      quietHoursStart: prefs.quietHoursStart || undefined,
      quietHoursEnd: prefs.quietHoursEnd || undefined,
      timezone: prefs.timezone,
      categoryPrefs: (prefs.categoryPrefs as any) || {},
    };
  }

  async updatePreferences(
    userId: string,
    updates: UpdatePreferencesRequest,
  ): Promise<UserNotificationPreferences> {
    const existing = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });

    if (!existing) {
      await this.prisma.notificationPreferences.create({
        data: {
          userId,
          categoryPrefs: {},
        },
      });
    }

    const updated = await this.prisma.notificationPreferences.update({
      where: { userId },
      data: {
        ...(updates.emailEnabled !== undefined && {
          emailEnabled: updates.emailEnabled,
        }),
        ...(updates.smsEnabled !== undefined && {
          smsEnabled: updates.smsEnabled,
        }),
        ...(updates.pushEnabled !== undefined && {
          pushEnabled: updates.pushEnabled,
        }),
        ...(updates.webhookEnabled !== undefined && {
          webhookEnabled: updates.webhookEnabled,
        }),
        ...(updates.digestMode !== undefined && {
          digestMode: updates.digestMode,
        }),
        ...(updates.digestTime !== undefined && {
          digestTime: updates.digestTime,
        }),
        ...(updates.quietHoursStart !== undefined && {
          quietHoursStart: updates.quietHoursStart,
        }),
        ...(updates.quietHoursEnd !== undefined && {
          quietHoursEnd: updates.quietHoursEnd,
        }),
        ...(updates.timezone !== undefined && { timezone: updates.timezone }),
        ...(updates.categoryPrefs !== undefined && {
          categoryPrefs: updates.categoryPrefs,
        }),
      },
    });

    return this.getPreferences(userId);
  }

  async shouldDeliverToChannel(
    userId: string,
    channel: NotificationChannel,
    category?: NotificationCategory,
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId);

    if (this.isInQuietHours(prefs)) {
      return false;
    }

    if (prefs.digestMode && channel !== NotificationChannel.IN_APP) {
      return false;
    }

    if (category && prefs.categoryPrefs[category]) {
      const categoryPref = prefs.categoryPrefs[category];
      switch (channel) {
        case NotificationChannel.EMAIL:
          return categoryPref.emailEnabled ?? prefs.emailEnabled;
        case NotificationChannel.SMS:
          return categoryPref.smsEnabled ?? prefs.smsEnabled;
        case NotificationChannel.PUSH:
          return categoryPref.pushEnabled ?? prefs.pushEnabled;
      }
    }

    switch (channel) {
      case NotificationChannel.EMAIL:
        return prefs.emailEnabled;
      case NotificationChannel.SMS:
        return prefs.smsEnabled;
      case NotificationChannel.PUSH:
        return prefs.pushEnabled;
      case NotificationChannel.WEBHOOK:
        return prefs.webhookEnabled;
      case NotificationChannel.IN_APP:
        return true;
      default:
        return false;
    }
  }

  private isInQuietHours(prefs: UserNotificationPreferences): boolean {
    if (
      prefs.quietHoursStart === undefined ||
      prefs.quietHoursEnd === undefined
    ) {
      return false;
    }

    const now = new Date();
    const hour = now.getHours();

    if (prefs.quietHoursStart < prefs.quietHoursEnd) {
      return hour >= prefs.quietHoursStart && hour < prefs.quietHoursEnd;
    } else {
      return hour >= prefs.quietHoursStart || hour < prefs.quietHoursEnd;
    }
  }
}
