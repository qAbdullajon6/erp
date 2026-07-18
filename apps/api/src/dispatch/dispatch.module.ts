import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OrderStateModule } from "../order-state/order-state.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { AssignmentPolicy } from "./assignment/assignment.policy";
import { AssignmentQueries } from "./assignment/assignment.queries";
import { DispatchController } from "./dispatch.controller";
import { DispatchService } from "./dispatch.service";
import { DispatchesController } from "./dispatches.controller";
import { DispatchesService } from "./dispatches.service";
import { DriverDispatchController } from "./driver/driver-dispatch.controller";
import { DriverDispatchService } from "./driver/driver-dispatch.service";

@Module({
  imports: [AuditModule, OrderStateModule, WorkflowsModule],
  // DriverDispatchController MUST come before DispatchesController: they share the
  // `dispatches` prefix, and DispatchesController has a `@Get(":id")` that would
  // otherwise swallow `/dispatches/my` as a dispatch whose id is "my". Nest matches
  // in registration order. See driver-dispatch.controller.ts, and the test that
  // pins this.
  controllers: [DriverDispatchController, DispatchController, DispatchesController],
  providers: [
    DispatchService,
    DispatchesService,
    DriverDispatchService,
    AssignmentPolicy,
    AssignmentQueries,
  ],
  // Exported so Task 8.7 can make the Orders endpoints wrappers that call the
  // policy instead of carrying their own copy of these rules.
  exports: [AssignmentPolicy, AssignmentQueries, DispatchesService],
})
export class DispatchModule {}
