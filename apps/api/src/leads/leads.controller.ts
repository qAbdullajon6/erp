import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { LeadsService } from "./leads.service";

/// Intentionally has no JwtAuthGuard — demo requests come from anonymous
/// visitors on the marketing page. It is therefore the one write route anyone
/// on the internet can reach, so it carries a much stricter throttle than the
/// global 300/min default.
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /// 6/min, not 3: rejected requests also consume the budget, so a visitor who
  /// mistypes their email twice would otherwise lock themselves out of the form.
  @Post()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(201)
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }
}
