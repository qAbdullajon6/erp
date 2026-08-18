import { Module } from "@nestjs/common";
import { WorkflowsModule } from "../workflows/workflows.module";
import { BillingModule } from "../billing/billing.module";
import { VehiclesController } from "./vehicles.controller";
import { VehiclesService } from "./vehicles.service";

@Module({
  imports: [WorkflowsModule, BillingModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
