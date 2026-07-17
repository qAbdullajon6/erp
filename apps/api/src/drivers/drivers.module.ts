import { Module } from "@nestjs/common";
import { WorkflowsModule } from "../workflows/workflows.module";
import { DriversController } from "./drivers.controller";
import { DriversService } from "./drivers.service";

@Module({
  imports: [WorkflowsModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
