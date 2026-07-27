import { Module } from "@nestjs/common";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { PlatformModule } from "../platform/platform.module";

@Module({
  imports: [PlatformModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
