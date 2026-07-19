import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import Redis from "ioredis";

@Injectable()
export class RedisHealthIndicator {
  private redis: Redis | null = null;

  constructor(private readonly healthIndicatorService: HealthIndicatorService) {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
    }
  }

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    // Redis is optional — if REDIS_URL is not configured, report as "not configured"
    // rather than down, since the application boots and runs without it.
    if (!this.redis) {
      return indicator.up("not_configured");
    }

    try {
      await this.redis.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : "unknown error" });
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
