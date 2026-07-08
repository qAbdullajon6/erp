import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OnboardingService } from './onboarding.service';
import { OnboardingProgressDto, CompleteStepDto, SkipOnboardingDto } from './dto/onboarding.dto';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Get('progress')
  async getProgress(@Req() req: any): Promise<{ data: OnboardingProgressDto }> {
    const organizationId = req.user.organizationId;
    const progress = await this.onboardingService.getProgress(organizationId);
    return { data: progress };
  }

  @Post('steps/:step/complete')
  @HttpCode(HttpStatus.OK)
  async completeStep(
    @Req() req: any,
    @Body() dto: CompleteStepDto,
  ): Promise<{ data: OnboardingProgressDto }> {
    const organizationId = req.user.organizationId;
    const progress = await this.onboardingService.completeStep(
      organizationId,
      dto,
    );
    return { data: progress };
  }

  @Post('skip')
  @HttpCode(HttpStatus.OK)
  async skip(
    @Req() req: any,
    @Body() dto?: SkipOnboardingDto,
  ): Promise<{ data: OnboardingProgressDto }> {
    const organizationId = req.user.organizationId;
    const progress = await this.onboardingService.skip(organizationId);
    return { data: progress };
  }
}
