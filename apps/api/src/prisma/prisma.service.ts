import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config/configuration";

/// Production connection pool is configured via DATABASE_URL query parameters:
///   connection_limit=N - Max connections (default: num_cpus * 2 + 1)
///   pool_timeout=10    - Seconds to wait for connection (default: 10)
///   connect_timeout=30 - Seconds for initial connect (default: 5)
///
/// See apps/api/.env.example for production tuning guidance.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private queryTimeoutApplied = false;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  /// Deliberately does NOT eagerly `$connect()` here. Prisma connects lazily
  /// on its first real query regardless, and the app must be able to boot
  /// (and answer the DB-independent GET /health liveness check) even when
  /// the database is unreachable — only GET /health/database should ever
  /// fail in that situation.
  ///
  /// Query timeout is applied on first successful connection via $connect()
  /// event handler, not here, so the app can boot even if the database is down.
  async onModuleInit() {
    const appConfig = this.configService.get<AppConfig>("app")!;
    const queryTimeoutSeconds = Math.ceil(appConfig.queryTimeoutMs / 1000);

    // Apply statement_timeout on first successful connection. This runs once
    // per connection in the pool when Prisma establishes it. The $on hook
    // fires before any query is executed, so the timeout is in effect for
    // all application queries.
    this.$on("connect" as never, async () => {
      if (!this.queryTimeoutApplied) {
        try {
          // PostgreSQL statement_timeout: max execution time per statement.
          // Format: '15s' for 15 seconds, '500ms' for 500 milliseconds.
          // Applied at session level, inherited by all statements in this connection.
          await this.$executeRaw`SET statement_timeout = ${queryTimeoutSeconds * 1000}`;
          this.queryTimeoutApplied = true;
          this.logger.log(
            `Query timeout applied: ${appConfig.queryTimeoutMs}ms (statement_timeout=${queryTimeoutSeconds}s)`,
          );
        } catch (error) {
          // Non-fatal: log and continue. The app remains operational, just
          // without query timeout protection. Better than refusing to boot.
          this.logger.error(
            `Failed to apply query timeout: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });

    this.logger.log("PrismaService ready (connects lazily on first query)");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
