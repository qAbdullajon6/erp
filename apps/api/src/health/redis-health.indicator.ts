import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import Redis from "ioredis";

@Injectable()
export class RedisHealthIndicator {
  private redis: Redis | null = null;

  constructor(private readonly healthIndicatorService: HealthIndicatorService) {
    const url = process.env.REDIS_URL;
    if (url) {
      // Do NOT use lazyConnect:true here. Without it ioredis starts the TCP
      // handshake during module construction (app bootstrap), so the connection
      // is established before the first /health/ready probe fires. lazyConnect
      // defers the connect until the first command, which races the probe and
      // causes "Stream isn't writeable and enableOfflineQueue options is false"
      // on every container start.
      this.redis = new Redis(url, {
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
