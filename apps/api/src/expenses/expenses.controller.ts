import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { ListExpensesQueryDto } from "./dto/list-expenses-query.dto";
import { RejectExpenseDto } from "./dto/reject-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { ExpensesService } from "./expenses.service";

/// SALES_CRM_MANAGER and DISPATCHER have no @Roles entry here at all — the
/// phase spec's "no payment/expense approval" for sales and "no payment/
/// expense actions" for dispatcher, combined with expenses not being in
/// either role's stated read scope, means 403 on every route in this
/// controller for both. DRIVER likewise has no access.
const READ_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER"];
const WRITE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER"];
const APPROVE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListExpensesQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.expensesService.list(user.organizationId, query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.expensesService.create(user.organizationId, dto, user);
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.expensesService.getById(user.organizationId, id);
  }

  @Roles(...WRITE_ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.expensesService.update(user.organizationId, id, dto, user);
  }

  @Roles(...APPROVE_ROLES)
  @Post(":id/approve")
  @HttpCode(200)
  approve(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.expensesService.approve(user.organizationId, id, user);
  }

  @Roles(...APPROVE_ROLES)
  @Post(":id/reject")
  @HttpCode(200)
  reject(
    @Param("id") id: string,
    @Body() dto: RejectExpenseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.expensesService.reject(user.organizationId, id, dto, user);
  }
}
