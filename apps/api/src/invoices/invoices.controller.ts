import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { ListInvoicesQueryDto } from "./dto/list-invoices-query.dto";
import { UpdateInvoiceDto } from "./dto/update-invoice.dto";
import { InvoicesService } from "./invoices.service";

/// Role matrix per the Finance phase spec:
/// - ADMIN/ACCOUNTANT: full access, including send/cancel.
/// - OPERATIONS_MANAGER: "read finance + create draft invoice... but
///   cannot approve expenses" — read+create+update (editing a DRAFT before
///   finalization), but not send/cancel (a finalization decision, read as
///   belonging to Accounting).
/// - SALES_CRM_MANAGER: "create/read draft invoices only" — same
///   read+create+update scope as OPERATIONS_MANAGER, also excluded from
///   send/cancel.
/// - DISPATCHER: "read-only finance summary only" — no access to the raw
///   invoice list/detail at all (see FinanceController for what Dispatcher
///   *does* get).
/// - DRIVER: no finance access.
const READ_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER", "SALES_CRM_MANAGER"];
const WRITE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT", "OPERATIONS_MANAGER", "SALES_CRM_MANAGER"];
const FINALIZE_ROLES: MembershipRole[] = ["ADMIN", "ACCOUNTANT"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListInvoicesQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.invoicesService.list(user.organizationId, query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.invoicesService.create(user.organizationId, dto, user);
  }

  @Roles(...WRITE_ROLES)
  @Post("from-order/:orderId")
  createFromOrder(@Param("orderId") orderId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.invoicesService.createFromOrder(user.organizationId, orderId, user);
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.invoicesService.getById(user.organizationId, id);
  }

  @Roles(...WRITE_ROLES)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.invoicesService.update(user.organizationId, id, dto, user);
  }

  @Roles(...FINALIZE_ROLES)
  @Post(":id/send")
  @HttpCode(200)
  send(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.invoicesService.send(user.organizationId, id, user);
  }

  @Roles(...FINALIZE_ROLES)
  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.invoicesService.cancel(user.organizationId, id, user);
  }
}
