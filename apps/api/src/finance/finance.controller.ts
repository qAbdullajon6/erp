import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { FinanceService } from "./finance.service";

/// The broadest finance read scope in this phase — every role except
/// DRIVER, since "DISPATCHER: read-only finance summary only" means this
/// (plus order-profitability, an equally coarse read-only aggregate) is
/// the *entirety* of Dispatcher's finance access, unlike the raw invoice/
/// payment/expense lists which Dispatcher cannot see at all.
const ROLES: MembershipRole[] = [
  "ADMIN",
  "ACCOUNTANT",
  "OPERATIONS_MANAGER",
  "SALES_CRM_MANAGER",
  "DISPATCHER",
];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("finance")
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Roles(...ROLES)
  @Get("summary")
  summary(@CurrentUser() user: CurrentUserPayload) {
    return this.financeService.summary(user.organizationId);
  }

  @Roles(...ROLES)
  @Get("order-profitability/:orderId")
  orderProfitability(@Param("orderId") orderId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.financeService.orderProfitability(user.organizationId, orderId);
  }
}
