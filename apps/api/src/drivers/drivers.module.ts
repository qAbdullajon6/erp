import { Module, forwardRef } from "@nestjs/common";
import { DispatchModule } from "../dispatch/dispatch.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { BillingModule } from "../billing/billing.module";
import { DriverDocumentsController } from "./driver-documents.controller";
import { DriverDocumentsService } from "./driver-documents.service";
import { DriverMeController } from "./driver-me.controller";
import { DriversController } from "./drivers.controller";
import { DriversService } from "./drivers.service";

@Module({
  imports: [WorkflowsModule, forwardRef(() => DispatchModule), BillingModule],
  controllers: [DriverMeController, DriversController, DriverDocumentsController],
  providers: [DriversService, DriverDocumentsService],
  exports: [DriversService],
})
export class DriversModule {}
