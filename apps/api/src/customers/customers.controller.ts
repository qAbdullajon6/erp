import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

const READ_ROLES: MembershipRole[] = [
  "ADMIN",
  "SALES_CRM_MANAGER",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
];
const WRITE_ROLES: MembershipRole[] = ["ADMIN", "SALES_CRM_MANAGER"];

/// DRIVER has no @Roles entry on any route here, so RolesGuard rejects it
/// with 403 on every endpoint in this controller — matching "DRIVER: no
/// access" in the phase spec.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListCustomersQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.customersService.list(user.organizationId, query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: CurrentUserPayload) {
    return this.customersService.create(user.organizationId, dto, user);
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.customersService.getById(user.organizationId, id);
  }

  @Roles(...WRITE_ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.customersService.update(user.organizationId, id, dto, user);
  }

  @Roles(...WRITE_ROLES)
  @Post(":id/archive")
  @HttpCode(200)
  archive(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.customersService.archive(user.organizationId, id, user);
  }

  @Roles(...WRITE_ROLES)
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.customersService.restore(user.organizationId, id, user);
  }
}
