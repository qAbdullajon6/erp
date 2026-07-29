import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AuditService } from "./audit.service";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

const READ_ROLES: MembershipRole[] = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "ACCOUNTANT",
];

/// Tenant Audit Log for `/app/audit-logs`. Distinct from Platform Console
/// `/platform/audit` (cross-tenant, platform-admin-only). Org scope always
/// comes from the JWT membership — never from a client-supplied org id.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListAuditLogsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.auditService.listForOrganization(user.organizationId, query);
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  getById(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.auditService.getByIdForOrganization(user.organizationId, id);
  }
}
