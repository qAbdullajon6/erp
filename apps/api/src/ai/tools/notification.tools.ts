import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationDispatcherService } from "../../notifications/dispatcher/notification-dispatcher.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { MembershipRole, NotificationCategory, NotificationSeverity } from "@prisma/client";
import type { AiTool } from "./tool.interface";

const ALL_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
  "SALES_CRM_MANAGER",
  "DRIVER",
];

const MANAGEMENT_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
];

@Injectable()
export class NotificationAiTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  all(): AiTool[] {
    return [
      {
        name: "list_recent_notifications",
        description: "List recent notifications for the current user, optionally filtered by category or read status",
        allowedRoles: ALL_ROLES,
        mutating: false,
        parameters: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["OPERATIONS", "FINANCE", "CUSTOMERS", "FLEET"],
              description: "Filter by notification category",
            },
            isRead: {
              type: "boolean",
              description: "Filter by read status (true = read, false = unread)",
            },
            limit: {
              type: "number",
              description: "Maximum number of notifications to return (default 20)",
            },
          },
        },
        handler: async (params: Record<string, unknown>, actor: CurrentUserPayload) => {
          const limit = (params.limit as number) || 20;
          const where: any = {
            organizationId: actor.organizationId,
            isArchived: false,
          };

          if (params.category) {
            where.category = params.category as string;
          }

          if (params.isRead !== undefined) {
            where.isRead = params.isRead as boolean;
          }

          const notifications = await this.prisma.notification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 50),
            select: {
              id: true,
              type: true,
              category: true,
              severity: true,
              title: true,
              message: true,
              entityType: true,
              entityId: true,
              isRead: true,
              createdAt: true,
            },
          });

          return {
            notifications,
            total: notifications.length,
            message: `Found ${notifications.length} notification(s)`,
          };
        },
      },
      {
        name: "get_unread_notification_count",
        description: "Get the count of unread notifications for the current user",
        allowedRoles: ALL_ROLES,
        mutating: false,
        parameters: {
          type: "object",
          properties: {},
        },
        handler: async (params: Record<string, unknown>, actor: CurrentUserPayload) => {
          const count = await this.prisma.notification.count({
            where: {
              organizationId: actor.organizationId,
              isRead: false,
              isArchived: false,
            },
          });

          return {
            unreadCount: count,
            message: `You have ${count} unread notification(s)`,
          };
        },
      },
      {
        name: "mark_notification_read",
        description: "Mark a specific notification as read",
        allowedRoles: ALL_ROLES,
        mutating: true,
        parameters: {
          type: "object",
          properties: {
            notificationId: {
              type: "string",
              description: "The ID of the notification to mark as read",
            },
          },
          required: ["notificationId"],
        },
        handler: async (params: Record<string, unknown>, actor: CurrentUserPayload) => {
          await this.prisma.notification.updateMany({
            where: {
              id: params.notificationId as string,
              organizationId: actor.organizationId,
            },
            data: {
              isRead: true,
              readAt: new Date(),
            },
          });

          return {
            success: true,
            message: `Notification marked as read`,
          };
        },
      },
      {
        name: "create_notification",
        description: "Create and dispatch a new notification to relevant team members",
        allowedRoles: MANAGEMENT_ROLES,
        mutating: true,
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Notification title",
            },
            message: {
              type: "string",
              description: "Notification message/body",
            },
            category: {
              type: "string",
              enum: ["OPERATIONS", "FINANCE", "CUSTOMERS", "FLEET"],
              description: "Notification category",
            },
            severity: {
              type: "string",
              enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
              description: "Notification severity level (default: MEDIUM)",
            },
            entityType: {
              type: "string",
              description: "Related entity type (e.g., 'order', 'dispatch', 'customer')",
            },
            entityId: {
              type: "string",
              description: "Related entity ID",
            },
          },
          required: ["title", "message", "category"],
        },
        handler: async (params: Record<string, unknown>, actor: CurrentUserPayload) => {
          const notification = await this.prisma.notification.create({
            data: {
              organizationId: actor.organizationId,
              type: "ai_copilot",
              category: params.category as NotificationCategory,
              severity: (params.severity as NotificationSeverity) || "MEDIUM",
              title: params.title as string,
              message: params.message as string,
              entityType: params.entityType as string | undefined,
              entityId: params.entityId as string | undefined,
              metadata: {
                createdByAi: true,
                userId: actor.userId,
              },
            },
          });

          await this.dispatcher.dispatch({
            organizationId: actor.organizationId,
            notificationId: notification.id,
            type: "ai_copilot",
            category: params.category as NotificationCategory,
            title: params.title as string,
            message: params.message as string,
            entityType: params.entityType as string | undefined,
            entityId: params.entityId as string | undefined,
            metadata: {
              createdByAi: true,
              userId: actor.userId,
            },
          });

          return {
            success: true,
            notificationId: notification.id,
            message: `Notification created and dispatched to relevant team members`,
          };
        },
      },
    ];
  }
}
