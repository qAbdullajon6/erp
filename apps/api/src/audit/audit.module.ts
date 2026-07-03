import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/// Global for the same reason PrismaModule is: every future module will
/// want to write audit events without re-importing this module each time.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
