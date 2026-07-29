import { Module, forwardRef } from "@nestjs/common";
import { DispatchModule } from "../dispatch/dispatch.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { DriversController } from "./drivers.controller";
import { DriverMeController } from "./driver-me.controller";
import { DriversService } from "./drivers.service";

@Module({
  imports: [WorkflowsModule, forwardRef(() => DispatchModule)],
  controllers: [DriverMeController, DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
