import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { PlatformAuditService } from "./platform-audit.service";

class ListPlatformAuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/audit")
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  list(@Query() query: ListPlatformAuditQueryDto) {
    return this.audit.list(query.page ?? 1, query.limit ?? 50, query.action, query.organizationId);
  }
}
