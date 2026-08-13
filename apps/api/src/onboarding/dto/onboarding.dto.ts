export class OnboardingProgressDto {
  organizationId: string;
  completed: boolean;
  skipped: boolean;
  steps: {
    organizationProfile: boolean;
    firstCustomer: boolean;
    firstDriver: boolean;
    firstVehicle: boolean;
    firstOrder: boolean;
  };
  skippedAt?: Date;
}
