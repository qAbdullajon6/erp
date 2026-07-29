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
import { DriverDispatchController } from "./driver/driver-dispatch.controller";
import { DriverDispatchService } from "./driver/driver-dispatch.service";

@Module({
  imports: [AuditModule, OrderStateModule, WorkflowsModule, TelematicsModule],
  // DriverDispatchController MUST come before DispatchesController: they share the
  // `dispatches` prefix, and DispatchesController has a `@Get(":id")` that would
  // otherwise swallow `/dispatches/my` as a dispatch whose id is "my". Nest matches
  // in registration order. See driver-dispatch.controller.ts, and the test that
  // pins this.
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
    DispatchConflictsService,
    AssignmentPolicy,
    AssignmentQueries,
  ],
  exports: [AssignmentPolicy, AssignmentQueries, DispatchesService, DispatchConflictsService],
})
export class DispatchModule {}
