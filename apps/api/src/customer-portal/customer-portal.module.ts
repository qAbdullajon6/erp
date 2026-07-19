import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { AuthConfig } from "../config/configuration";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { OrdersModule } from "../orders/orders.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { TelematicsModule } from "../telematics/telematics.module";
import { BillingModule } from "../billing/billing.module";
import { CustomerJwtStrategy } from "./auth/strategies/customer-jwt.strategy";
import { CustomerPortalAuthService } from "./auth/customer-portal-auth.service";
import { CustomerPortalAuthController } from "./auth/customer-portal-auth.controller";
import { CustomerOrdersService } from "./orders/customer-orders.service";
import { CustomerOrdersController } from "./orders/customer-orders.controller";
import { CustomerInvoicesService } from "./invoices/customer-invoices.service";
import { CustomerInvoicesController } from "./invoices/customer-invoices.controller";
import { CustomerDashboardService } from "./dashboard/customer-dashboard.service";
import { CustomerDashboardController } from "./dashboard/customer-dashboard.controller";
import { CustomerNotificationsService } from "./notifications/customer-notifications.service";
import { CustomerNotificationsController } from "./notifications/customer-notifications.controller";
import { CustomerDocumentsService } from "./documents/customer-documents.service";
import { CustomerDocumentsController } from "./documents/customer-documents.controller";
import { CustomerProfileService } from "./profile/customer-profile.service";
import { CustomerProfileController } from "./profile/customer-profile.controller";
import { CustomerPortalProvisioningService } from "./provisioning/customer-portal-provisioning.service";
import { CustomerPortalProvisioningController } from "./provisioning/customer-portal-provisioning.controller";
import { PublicCustomerPortalInvitationController } from "./provisioning/public-customer-portal-invitation.controller";
import { CustomerBillingService } from "./billing/customer-billing.service";
import { CustomerBillingController } from "./billing/customer-billing.controller";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const authConfig = configService.get<AuthConfig>("auth")!;
        return {
          secret: authConfig.jwtAccessSecret,
          signOptions: { expiresIn: authConfig.jwtAccessExpiresInSeconds },
        };
      },
    }),
    AuthModule,
    AuditModule,
    MailModule,
    OrdersModule,
    InvoicesModule,
    TelematicsModule,
    BillingModule,
  ],
  controllers: [
    CustomerPortalAuthController,
    CustomerOrdersController,
    CustomerInvoicesController,
    CustomerDashboardController,
    CustomerNotificationsController,
    CustomerDocumentsController,
    CustomerProfileController,
    CustomerPortalProvisioningController,
    PublicCustomerPortalInvitationController,
    CustomerBillingController,
  ],
  providers: [
    CustomerJwtStrategy,
    CustomerPortalAuthService,
    CustomerOrdersService,
    CustomerInvoicesService,
    CustomerDashboardService,
    CustomerNotificationsService,
    CustomerDocumentsService,
    CustomerProfileService,
    CustomerPortalProvisioningService,
    CustomerBillingService,
  ],
})
export class CustomerPortalModule {}
