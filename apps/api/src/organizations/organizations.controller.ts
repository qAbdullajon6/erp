import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AddMemberDto } from "./dto/add-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { OrganizationsService } from "./organizations.service";

/// Every route here derives its organization from the authenticated
/// membership (`user.organizationId`, set by JwtStrategy) — never from a
/// client-supplied organizationId. There is no route like
/// `/organizations/:id`; "current" always means "the org this access token
/// is scoped to."
@UseGuards(JwtAuthGuard)
@Controller("organizations/current")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  getCurrent(@CurrentUser() user: CurrentUserPayload) {
    return this.organizationsService.getCurrent(user.organizationId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Patch()
  updateCurrent(@Body() dto: UpdateOrganizationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.organizationsService.updateCurrent(user.organizationId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Get("members")
  listMembers(@CurrentUser() user: CurrentUserPayload) {
    return this.organizationsService.listMembers(user.organizationId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Post("members")
  addMember(@Body() dto: AddMemberDto, @CurrentUser() user: CurrentUserPayload) {
    return this.organizationsService.addMember(user.organizationId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Patch("members/:membershipId")
  updateMember(
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.organizationsService.updateMember(user.organizationId, membershipId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Delete("members/:membershipId")
  @HttpCode(200)
  removeMember(
    @Param("membershipId") membershipId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.organizationsService.removeMember(user.organizationId, membershipId, user);
  }
}
