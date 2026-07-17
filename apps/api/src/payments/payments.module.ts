import { Module } from "@nestjs/common";
import { InvoicesModule } from "../invoices/invoices.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { InvoicePaymentsController } from "./invoice-payments.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [InvoicesModule, WorkflowsModule],
  controllers: [PaymentsController, InvoicePaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
