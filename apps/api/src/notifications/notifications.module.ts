import { Module, forwardRef } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { EmailService } from "./email/email.service";
import { EmailProviderRegistry } from "./email/email-provider.registry";
import { TemplateService } from "./templates/template.service";
import { DeliveryQueueService } from "./queue/delivery-queue.service";
import { PreferencesService } from "./preferences/preferences.service";
import { NotificationDispatcherService } from "./dispatcher/notification-dispatcher.service";
import { NotificationCenterController } from "./notification-center.controller";
import { EmailTrackingController } from "./email-tracking.controller";

@Module({
  imports: [InvoicesModule, forwardRef(() => WorkflowsModule)],
  controllers: [
    NotificationsController,
    NotificationCenterController,
    EmailTrackingController,
  ],
  providers: [
    NotificationsService,
    EmailService,
    EmailProviderRegistry,
    TemplateService,
    DeliveryQueueService,
    PreferencesService,
    NotificationDispatcherService,
  ],
  exports: [
    NotificationsService,
    NotificationDispatcherService,
    EmailService,
    TemplateService,
  ],
})
export class NotificationsModule {}
