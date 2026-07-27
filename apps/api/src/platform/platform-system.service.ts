import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import type {
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
  UpsertFeatureFlagOverrideDto,
} from "./dto/feature-flag.dto";

@Injectable()
export class PlatformSystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async health() {
    const start = Date.now();
    let database: "up" | "down" = "up";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "down";
    }

    const redisConfigured = Boolean(process.env.REDIS_URL);
    return {
      status: database === "up" ? "ok" : "degraded",
      database,
      redis: redisConfigured ? "configured" : "not_configured",
      version: "0.1.0",
      commit: process.env.GIT_COMMIT_SHA || "unknown",
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
    };
  }

  async workers() {
    // No Bull workers yet — surface process-level truth so the console is honest.
    return {
      items: [
        {
          name: "api",
          status: "running",
          detail: "NestJS HTTP process",
        },
        {
          name: "notification-delivery",
          status: "in-process",
          detail: "Delivery queue processed in-process (no separate worker fleet)",
        },
      ],
    };
  }

  async queues() {
    const [pending, failed, sent] = await Promise.all([
      this.prisma.notificationDeliveryQueue.count({ where: { status: "PENDING" } }),
      this.prisma.notificationDeliveryQueue.count({ where: { status: "FAILED" } }),
      this.prisma.notificationDeliveryQueue.count({ where: { status: "SENT" } }),
    ]);
    return {
      items: [
        {
          name: "notification_delivery_queue",
          pending,
          failed,
          sent,
        },
      ],
    };
  }

  async listFlags() {
    return this.prisma.featureFlag.findMany({
      orderBy: { key: "asc" },
      include: {
        overrides: {
          include: {
            plan: { select: { id: true, name: true, slug: true } },
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  }

  async createFlag(dto: CreateFeatureFlagDto, actor: CurrentUserPayload) {
    const key = dto.key.trim().toLowerCase().replace(/\s+/g, "_");
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (existing) throw new BadRequestException("Feature flag key already exists");

    const flag = await this.prisma.featureFlag.create({
      data: {
        key,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        enabledGlobal: dto.enabledGlobal ?? false,
        scope: dto.scope ?? "ALL",
        updatedById: actor.userId,
      },
    });

    await this.audit.log({
      actorUserId: actor.userId,
      action: "platform.feature_flag.create",
      entityType: "FeatureFlag",
      entityId: flag.id,
      metadata: { key },
    });

    return flag;
  }

  async updateFlag(id: string, dto: UpdateFeatureFlagDto, actor: CurrentUserPayload) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Feature flag not found");

    const flag = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.enabledGlobal !== undefined ? { enabledGlobal: dto.enabledGlobal } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        updatedById: actor.userId,
      },
      include: { overrides: true },
    });

    await this.audit.log({
      actorUserId: actor.userId,
      action: "platform.feature_flag.update",
      entityType: "FeatureFlag",
      entityId: id,
      metadata: { ...dto },
    });

    return flag;
  }

  async upsertOverride(flagId: string, dto: UpsertFeatureFlagOverrideDto, actor: CurrentUserPayload) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new NotFoundException("Feature flag not found");
    if (!dto.planId && !dto.organizationId) {
      throw new BadRequestException("planId or organizationId is required");
    }

    const existing = await this.prisma.featureFlagOverride.findFirst({
      where: {
        featureFlagId: flagId,
        planId: dto.planId ?? null,
        organizationId: dto.organizationId ?? null,
      },
    });

    const override = existing
      ? await this.prisma.featureFlagOverride.update({
          where: { id: existing.id },
          data: { enabled: dto.enabled },
        })
      : await this.prisma.featureFlagOverride.create({
          data: {
            featureFlagId: flagId,
            planId: dto.planId,
            organizationId: dto.organizationId,
            enabled: dto.enabled,
          },
        });

    await this.audit.log({
      organizationId: dto.organizationId ?? null,
      actorUserId: actor.userId,
      action: "platform.feature_flag.override",
      entityType: "FeatureFlag",
      entityId: flagId,
      metadata: { ...dto },
    });

    return override;
  }
}
