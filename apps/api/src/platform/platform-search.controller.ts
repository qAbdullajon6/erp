import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../auth/guards/platform-admin.guard";
import { PlatformSearchService } from "./platform-search.service";

class PlatformSearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;
}

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller("platform/search")
export class PlatformSearchController {
  constructor(private readonly search: PlatformSearchService) {}

  @Get()
  searchAll(@Query() query: PlatformSearchQueryDto) {
    return this.search.search(query.q);
  }
}
