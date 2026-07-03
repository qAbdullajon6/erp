import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaHealthIndicator } from "./prisma-health.indicator";

@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  /// Liveness check — confirms the process is up and serving requests.
  /// Deliberately does not touch the database; use /health/database for that.
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  /// Readiness check for the database connection specifically.
  @Get("database")
  @HealthCheck()
  checkDatabase() {
    return this.health.check([() => this.prismaHealth.isHealthy("database")]);
  }
}
