import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentsService } from "./payments.service";

const READ_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER", "SALES_CRM_MANAGER"];
/// Recording a payment is Accounting-only — neither OPERATIONS_MANAGER nor
/// SALES_CRM_MANAGER is granted this in the phase spec (their scope stops
/// at "read finance" / "create draft invoices"), and DISPATCHER's finance
/// access is limited to the read-only summary (FinanceController).
const WRITE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("invoices/:invoiceId/payments")
export class InvoicePaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles(...READ_ROLES)
  @Get()
  listForInvoice(@Param("invoiceId") invoiceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.listForInvoice(user.organizationId, invoiceId);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  record(
    @Param("invoiceId") invoiceId: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.paymentsService.record(user.organizationId, invoiceId, dto, user);
  }
}
