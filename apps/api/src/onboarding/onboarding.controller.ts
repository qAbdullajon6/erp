import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/interfaces/current-user.interface';
import { OnboardingService } from './onboarding.service';
import { OnboardingProgressDto, CompleteStepDto } from './dto/onboarding.dto';

/// Onboarding progress is an org-wide setting (which setup steps the
/// organization has completed), not a personal one — same "org settings"
/// class as OrganizationsController, so writes are restricted the same
/// way. Reading progress stays open to any authenticated role since it's
/// harmless and the UI needs it to decide what to show.
const ONBOARDING_WRITE_ROLES = ['ADMIN', 'OPERATIONS_MANAGER'] as const;

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Get('progress')
  async getProgress(@CurrentUser() user: CurrentUserPayload): Promise<{ data: OnboardingProgressDto }> {
    const progress = await this.onboardingService.getProgress(user.organizationId);
    return { data: progress };
  }

  @Post('steps/:step/complete')
  @UseGuards(RolesGuard)
  @Roles(...ONBOARDING_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  async completeStep(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CompleteStepDto,
  ): Promise<{ data: OnboardingProgressDto }> {
    const progress = await this.onboardingService.completeStep(
      user.organizationId,
      dto,
    );
    return { data: progress };
  }

  @Post('skip')
  @UseGuards(RolesGuard)
  @Roles(...ONBOARDING_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  async skip(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ data: OnboardingProgressDto }> {
    const progress = await this.onboardingService.skip(user.organizationId);
    return { data: progress };
  }
}
