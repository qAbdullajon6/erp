import { Body, Controller, Get, HttpCode, Param, Patch, Query, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import { LeadsService } from "./leads.service";

/// Guards are applied per route, not on the controller: POST /leads must stay
/// reachable by anonymous visitors on the marketing page, while every read and
/// write below is FlowERP staff only.
///
/// The reads are NOT gated on @Roles("ADMIN"). Leads belong to no
/// organization, and MembershipRole.ADMIN only ever means "admin of one
/// customer organization" — so that would show every customer their
/// competitors' demo requests. See PlatformAdminGuard.
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /// The one write route anyone on the internet can reach, so it carries a
  /// much stricter throttle than the global 300/min default. 6/min, not 3:
  /// rejected requests also consume the budget, so a visitor who mistypes
  /// their email twice would otherwise lock themselves out of the form.
  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(201)
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @Get()
  list(@Query() query: ListLeadsQueryDto) {
    return this.leadsService.list(query);
  }

  /// Declared before `:id` — Nest matches in declaration order, so `:id` would
  /// otherwise swallow `/stats`.
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @Get("stats")
  stats() {
    return this.leadsService.statusCounts();
  }

  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @Get(":id")
  getById(@Param("id") id: string) {
    return this.leadsService.getById(id);
  }

  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateLeadStatusDto) {
    return this.leadsService.updateStatus(id, dto);
  }
}
