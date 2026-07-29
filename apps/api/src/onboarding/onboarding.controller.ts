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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/interfaces/current-user.interface';
import { OnboardingService } from './onboarding.service';
import { OnboardingProgressDto, CompleteStepDto } from './dto/onboarding.dto';

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
  @HttpCode(HttpStatus.OK)
  async skip(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ data: OnboardingProgressDto }> {
    const progress = await this.onboardingService.skip(user.organizationId);
    return { data: progress };
  }
}
