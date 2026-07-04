import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { ListPaymentsQueryDto } from "./dto/list-payments-query.dto";
import { PaymentsService } from "./payments.service";

/// Reading payments follows the same scope as reading invoices; recording
/// one is Accounting-only — see InvoicePaymentsController and
/// docs/FINANCE_API.md.
const READ_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER", "SALES_CRM_MANAGER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListPaymentsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.paymentsService.list(user.organizationId, query);
  }
}
