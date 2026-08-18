import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { PlatformModule } from "../platform/platform.module";
import { LeadTimelineModule } from "./lead-timeline.module";

@Module({
  imports: [PlatformModule, LeadTimelineModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
