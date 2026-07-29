import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OrderStateModule } from "../order-state/order-state.module";
import { TelematicsModule } from "../telematics/telematics.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { AssignmentPolicy } from "./assignment/assignment.policy";
import { AssignmentQueries } from "./assignment/assignment.queries";
import { DispatchConflictsController } from "./conflicts/dispatch-conflicts.controller";
import { DispatchConflictsService } from "./conflicts/dispatch-conflicts.service";
import { DispatchController } from "./dispatch.controller";
import { DispatchService } from "./dispatch.service";
import { DispatchesController } from "./dispatches.controller";
import { DispatchesService } from "./dispatches.service";
import { DriverActionEventsService } from "./driver/driver-action-events.service";
import { DriverDispatchController } from "./driver/driver-dispatch.controller";
import { DriverDispatchService } from "./driver/driver-dispatch.service";
import { DriverWorkspaceService } from "./driver/driver-workspace.service";

@Module({
  imports: [AuditModule, OrderStateModule, WorkflowsModule, TelematicsModule],
  controllers: [
    DriverDispatchController,
    DispatchConflictsController,
    DispatchController,
    DispatchesController,
  ],
  providers: [
    DispatchService,
    DispatchesService,
    DriverDispatchService,
    DriverWorkspaceService,
    DriverActionEventsService,
    DispatchConflictsService,
    AssignmentPolicy,
    AssignmentQueries,
  ],
  exports: [
    AssignmentPolicy,
    AssignmentQueries,
    DispatchesService,
    DispatchConflictsService,
    DriverWorkspaceService,
    DriverActionEventsService,
  ],
})
export class DispatchModule {}
