export class OnboardingProgressDto {
  id: string;
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
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class CompleteStepDto {
  step:
    | 'organizationProfile'
    | 'firstCustomer'
    | 'firstDriver'
    | 'firstVehicle'
    | 'firstOrder';
}

export class SkipOnboardingDto {
  reason?: string;
}
