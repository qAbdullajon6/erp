import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import configuration from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { MailModule } from "./mail/mail.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { CustomersModule } from "./customers/customers.module";
import { DriversModule } from "./drivers/drivers.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { OrdersModule } from "./orders/orders.module";
import { DispatchModule } from "./dispatch/dispatch.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PaymentsModule } from "./payments/payments.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { FinanceModule } from "./finance/finance.module";
import { ReportsModule } from "./reports/reports.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { LeadsModule } from "./leads/leads.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { InvitationModule } from "./invitations/invitation.module";
import { testSupportImports } from "./test-support/test-support.module";
import { LoggingMiddleware } from "./common/middleware/logging.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Global default: 300 requests / 60s per IP. A single SPA page load fans
    // out into many parallel reads (/auth/me plus every list endpoint the
    // view needs), so a low global ceiling trips on ordinary navigation
    // rather than on abuse. Sensitive auth endpoints override this with a
    // stricter @Throttle() (see AuthController); HealthController opts out
    // entirely with @SkipThrottle().
    //
    // Without REDIS_URL the counters live in this process's memory, which is
    // correct for one instance and wrong for two: each would keep its own
    // tally, so N instances make every limit N times looser — including the
    // 5/min brute-force guard on /auth/login. Set REDIS_URL to share them.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      ...(process.env.REDIS_URL
        ? { storage: new ThrottlerStorageRedisService(process.env.REDIS_URL) }
        : {}),
    }),
    PrismaModule,
    AuditModule,
    MailModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    CustomersModule,
    DriversModule,
    VehiclesModule,
    OrdersModule,
    DispatchModule,
    InvoicesModule,
    PaymentsModule,
    ExpensesModule,
    FinanceModule,
    ReportsModule,
    NotificationsModule,
    OnboardingModule,
    LeadsModule,
    InvitationModule,
    // TEST-ONLY. Yields TestSupportModule under NODE_ENV=test and an empty list
    // everywhere else, so a production build registers zero extra routes and
    // zero extra providers. The e2e suite needs it because a raw invitation
    // token is never persisted — only its hash — so it is otherwise unreachable.
    ...testSupportImports(),
  ],
  providers: [
    // Disabled under NODE_ENV=test: e2e tests deliberately make many rapid
    // auth requests from the same IP to exercise register/login/refresh
    // flows, which would otherwise trip the intentionally strict
    // production rate limits (see AuthController's @Throttle overrides) and
    // make the test suite flaky/order-dependent. Rate limiting itself isn't
    // what's under test here.
    ...(process.env.NODE_ENV === "test"
      ? []
      : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes("*");
  }
}
