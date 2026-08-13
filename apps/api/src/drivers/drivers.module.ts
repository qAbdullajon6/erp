import { Module, forwardRef } from "@nestjs/common";
import { DispatchModule } from "../dispatch/dispatch.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { BillingModule } from "../billing/billing.module";
import { DriversController } from "./drivers.controller";
import { DriverMeController } from "./driver-me.controller";
import { DriversService } from "./drivers.service";

@Module({
  imports: [WorkflowsModule, forwardRef(() => DispatchModule), BillingModule],
  controllers: [DriverMeController, DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
