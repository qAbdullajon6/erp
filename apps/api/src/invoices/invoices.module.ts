import { Module, forwardRef } from "@nestjs/common";
import { WorkflowsModule } from "../workflows/workflows.module";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

/// WorkflowsModule is imported via forwardRef to break the module cycle
/// Workflows → Notifications → Invoices → Workflows. NotificationsModule already
/// forwardRefs WorkflowsModule for the same cycle; this is the remaining direct
/// edge. Without it, Nest's scanner sees WorkflowsModule as `undefined` at
/// InvoicesModule decoration time (the class is mid-evaluation in the cycle).
@Module({
  imports: [forwardRef(() => WorkflowsModule)],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
