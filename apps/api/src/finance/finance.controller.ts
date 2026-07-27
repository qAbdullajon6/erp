import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { FinanceService } from "./finance.service";

/// The broadest finance read scope — every role except DRIVER. Dispatcher
/// only reaches summary / profitability (not invoice/expense lists).
const ROLES: MembershipRole[] = [
  "ADMIN",
  "ACCOUNTANT",
  "OPERATIONS_MANAGER",
  "SALES_CRM_MANAGER",
  "DISPATCHER",
];

/// Matches ExpensesController.WRITE_ROLES — accountants need fleet labels
/// when attributing fuel/driver costs without FLEET_ROLES access.
const LOOKUP_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER"];

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

  @Roles(...LOOKUP_ROLES)
  @Get("lookups/drivers")
  lookupDrivers(@CurrentUser() user: CurrentUserPayload) {
    return this.financeService.lookupDrivers(user.organizationId);
  }

  @Roles(...LOOKUP_ROLES)
  @Get("lookups/vehicles")
  lookupVehicles(@CurrentUser() user: CurrentUserPayload) {
    return this.financeService.lookupVehicles(user.organizationId);
  }
}
