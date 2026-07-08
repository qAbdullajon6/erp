import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingProgressDto, CompleteStepDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  async getProgress(organizationId: string): Promise<OnboardingProgressDto> {
    const progress = await this.prisma.onboardingProgress.findUnique({
      where: { organizationId },
    });

    if (!progress) {
      throw new Error(
        `Onboarding progress not found for organization ${organizationId}`,
      );
    }

    return this.mapToDto(progress);
  }

  async completeStep(
    organizationId: string,
    dto: CompleteStepDto,
  ): Promise<OnboardingProgressDto> {
    const progress = await this.prisma.onboardingProgress.findUnique({
      where: { organizationId },
    });

    if (!progress) {
      throw new Error(
        `Onboarding progress not found for organization ${organizationId}`,
      );
    }

    const steps = progress.steps as Record<string, boolean>;
    steps[dto.step] = true;

    const allStepsCompleted = Object.values(steps).every((v) => v);

    const updated = await this.prisma.onboardingProgress.update({
      where: { organizationId },
      data: {
        steps,
        completed: allStepsCompleted,
        completedAt: allStepsCompleted ? new Date() : undefined,
      },
    });

    return this.mapToDto(updated);
  }

  async skip(organizationId: string): Promise<OnboardingProgressDto> {
    const updated = await this.prisma.onboardingProgress.update({
      where: { organizationId },
      data: {
        skipped: true,
        skippedAt: new Date(),
      },
    });

    return this.mapToDto(updated);
  }

  async createForOrganization(organizationId: string): Promise<void> {
    const existing = await this.prisma.onboardingProgress.findUnique({
      where: { organizationId },
    });

    if (existing) {
      return; // Already exists
    }

    await this.prisma.onboardingProgress.create({
      data: {
        organizationId,
        completed: false,
        skipped: false,
        steps: {
          organizationProfile: false,
          firstCustomer: false,
          firstDriver: false,
          firstVehicle: false,
          firstOrder: false,
        },
      },
    });
  }

  private mapToDto(progress: any): OnboardingProgressDto {
    return {
      id: progress.id,
      organizationId: progress.organizationId,
      completed: progress.completed,
      skipped: progress.skipped,
      steps: progress.steps,
      skippedAt: progress.skippedAt,
      completedAt: progress.completedAt,
      createdAt: progress.createdAt,
      updatedAt: progress.updatedAt,
    };
  }
}
