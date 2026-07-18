import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaHealthIndicator } from "./prisma-health.indicator";
import { RedisHealthIndicator } from "./redis-health.indicator";

/// Application metadata injected at build/runtime for observability.
const PACKAGE_VERSION = "0.1.0"; // Updated manually or via build script
const GIT_COMMIT_SHA = process.env.GIT_COMMIT_SHA || "unknown";
const START_TIME = Date.now();

@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
  ) {}

  /// Liveness check — confirms the process is up and serving requests.
  /// Deliberately does not touch the database; use /health/database for that.
  /// Enhanced with version, commit, uptime, and timestamp for production ops.
  @Get()
  @HealthCheck()
  async check() {
    const healthResult = await this.health.check([]);
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

    return {
      ...healthResult,
      info: {
        ...healthResult.info,
        version: { status: "up", version: PACKAGE_VERSION },
        commit: { status: "up", sha: GIT_COMMIT_SHA },
        uptime: { status: "up", seconds: uptimeSeconds },
      },
      details: {
        ...healthResult.details,
        version: { status: "up", version: PACKAGE_VERSION },
        commit: { status: "up", sha: GIT_COMMIT_SHA },
        uptime: { status: "up", seconds: uptimeSeconds },
      },
      timestamp: new Date().toISOString(),
    };
  }

  /// Readiness check for the database connection specifically.
  @Get("database")
  @HealthCheck()
  checkDatabase() {
    return this.health.check([() => this.prismaHealth.isHealthy("database")]);
  }

  /// Redis connectivity check. Reports "not_configured" if REDIS_URL is unset,
  /// which is a valid production state (single-instance deployments run
  /// in-process rate limiting without Redis).
  @Get("redis")
  @HealthCheck()
  checkRedis() {
    return this.health.check([() => this.redisHealth.isHealthy("redis")]);
  }

  /// Comprehensive readiness check — all dependencies at once. Use this for
  /// pre-deployment verification or monitoring dashboards that need full status.
  @Get("ready")
  @HealthCheck()
  async checkReady() {
    return this.health.check([
      () => this.prismaHealth.isHealthy("database"),
      () => this.redisHealth.isHealthy("redis"),
    ]);
  }
}
