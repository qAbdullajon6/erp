import {
  Controller,
  Get,
  Post,
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
import { OnboardingProgressDto } from './dto/onboarding.dto';

/// Whether the setup checklist is dismissed is an org-wide setting, not a
/// personal one — same "org settings" class as OrganizationsController, so
/// writes are restricted the same way. Reading progress stays open to any
/// authenticated role since it's harmless and the UI needs it to decide what
/// to show.
const ONBOARDING_WRITE_ROLES = ['ADMIN', 'OPERATIONS_MANAGER'] as const;

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  /// Returned bare: the global response interceptor is what wraps handler
  /// results in `{ data }`. This controller used to wrap them itself, so
  /// every response came back doubly nested — which no client would have
  /// survived, and none ever hit it to find out.
  @Get('progress')
  getProgress(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OnboardingProgressDto> {
    return this.onboardingService.getProgress(user.organizationId);
  }

  @Post('skip')
  @UseGuards(RolesGuard)
  @Roles(...ONBOARDING_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  skip(@CurrentUser() user: CurrentUserPayload): Promise<OnboardingProgressDto> {
    return this.onboardingService.skip(user.organizationId);
  }
}
