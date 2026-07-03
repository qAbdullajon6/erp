import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

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
