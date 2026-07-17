import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { OrderStateModule } from "../order-state/order-state.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

/// Orders depends on Dispatch, not the other way round (ADR-001): an order-level
/// request is executed by moving a dispatch, and the order is derived from it.
@Module({
  imports: [AuditModule, DispatchModule, OrderStateModule, WorkflowsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
