import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AssignOrderDto } from "./dto/assign-order.dto";
import { CancelOrderDto } from "./dto/cancel-order.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersService } from "./orders.service";

/// Role matrix per the Orders + Dispatch phase spec:
/// - ADMIN / OPERATIONS_MANAGER / DISPATCHER: full access, including
///   assign/status/cancel ("manage orders... assignments, status updates").
/// - SALES_CRM_MANAGER: "create/read/update orders but cannot assign
///   drivers/vehicles" — read+write on the plain CRUD routes, excluded from
///   assign/status/cancel (those are fulfillment-pipeline actions, not order
///   record edits).
/// - ACCOUNTANT: "read-only orders and dispatch" — read only, no write
///   routes at all.
/// - DRIVER: "no general list access yet" — no @Roles entry anywhere here,
///   so RolesGuard 403s every route.
const READ_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SALES_CRM_MANAGER",
  "ACCOUNTANT",
];
const CREATE_UPDATE_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SALES_CRM_MANAGER"];
const OPERATIONAL_ROLES: MembershipRole[] = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListOrdersQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.list(user.organizationId, query);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.create(user.organizationId, dto, user);
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.ordersService.getById(user.organizationId, id);
  }

  @Roles(...CREATE_UPDATE_ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.update(user.organizationId, id, dto, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/assign")
  @HttpCode(200)
  assign(
    @Param("id") id: string,
    @Body() dto: AssignOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.assign(user.organizationId, id, dto, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/status")
  @HttpCode(200)
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.updateStatus(user.organizationId, id, dto, user);
  }

  @Roles(...OPERATIONAL_ROLES)
  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.ordersService.cancel(user.organizationId, id, dto, user);
  }
}
