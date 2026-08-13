import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingProgressDto } from './dto/onboarding.dto';

/// Setup progress is *derived*, not recorded.
///
/// This module previously kept a row of five booleans that only ever flipped
/// when a client POSTed a step as complete. Nothing ever did — and nothing
/// called `createForOrganization` either, so no organization had a row and
/// `GET /onboarding/progress` threw for every caller. The whole feature was
/// unreachable.
///
/// Storing "has this company added a vehicle yet" as a flag is the wrong shape
/// regardless: the answer is already in the database, and a flag can disagree
/// with it the moment someone deletes their only vehicle. So each step asks the
/// data directly. The only thing worth persisting is the admin's choice to
/// dismiss the checklist, which nothing else can infer.
@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  async getProgress(organizationId: string): Promise<OnboardingProgressDto> {
    const [organization, customers, drivers, vehicles, orders, record] =
      await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { legalName: true, taxId: true, address: true },
        }),
        this.prisma.customer.count({ where: { organizationId } }),
        this.prisma.driver.count({ where: { organizationId } }),
        this.prisma.vehicle.count({ where: { organizationId } }),
        this.prisma.order.count({ where: { organizationId } }),
        this.prisma.onboardingProgress.findUnique({ where: { organizationId } }),
      ]);

    const steps = {
      /// A trading name comes free with registration; what makes the company
      /// invoice-ready is the identity that has to appear on the document.
      organizationProfile: Boolean(
        organization?.legalName?.trim() ||
          organization?.taxId?.trim() ||
          organization?.address?.trim(),
      ),
      firstCustomer: customers > 0,
      firstDriver: drivers > 0,
      firstVehicle: vehicles > 0,
      firstOrder: orders > 0,
    };

    const completed = Object.values(steps).every(Boolean);

    return {
      organizationId,
      completed,
      skipped: record?.skipped ?? false,
      steps,
      skippedAt: record?.skippedAt ?? undefined,
    };
  }

  async skip(organizationId: string): Promise<OnboardingProgressDto> {
    await this.prisma.onboardingProgress.upsert({
      where: { organizationId },
      create: {
        organizationId,
        skipped: true,
        skippedAt: new Date(),
        steps: {},
      },
      update: { skipped: true, skippedAt: new Date() },
    });

    return this.getProgress(organizationId);
  }
}
