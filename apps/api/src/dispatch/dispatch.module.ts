import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DispatchController } from "./dispatch.controller";
import { DispatchService } from "./dispatch.service";
import { DispatchesController } from "./dispatches.controller";
import { DispatchesService } from "./dispatches.service";

@Module({
  imports: [AuditModule],
  controllers: [DispatchController, DispatchesController],
  providers: [DispatchService, DispatchesService],
})
export class DispatchModule {}
