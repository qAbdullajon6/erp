import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportRealtimeService } from "./realtime/support-realtime.service";

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService, SupportRealtimeService],
  exports: [SupportService, SupportRealtimeService],
})
export class SupportModule {}
