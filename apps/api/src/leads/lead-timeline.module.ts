import { Module } from "@nestjs/common";
import { LeadTimelineService } from "./lead-timeline.service";

/// Tiny module so InvitationModule / PlatformModule can record timeline events
/// without importing the full LeadsModule (which itself imports PlatformModule).
@Module({
  providers: [LeadTimelineService],
  exports: [LeadTimelineService],
})
export class LeadTimelineModule {}
