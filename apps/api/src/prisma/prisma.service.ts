import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/// Production connection pool is configured via DATABASE_URL query parameters:
///   connection_limit=N - Max connections (default: num_cpus * 2 + 1)
///   pool_timeout=10    - Seconds to wait for connection (default: 10)
///   connect_timeout=30 - Seconds for initial connect (default: 5)
///
/// See apps/api/.env.example for production tuning guidance.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /// Deliberately does NOT eagerly `$connect()` here. Prisma connects lazily
  /// on its first real query regardless, and the app must be able to boot
  /// (and answer the DB-independent GET /health liveness check) even when
  /// the database is unreachable — only GET /health/database should ever
  /// fail in that situation.
  onModuleInit() {
    this.logger.log("PrismaService ready (connects lazily on first query)");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
