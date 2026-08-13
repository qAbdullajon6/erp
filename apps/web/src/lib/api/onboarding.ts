import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export interface OnboardingSteps {
  organizationProfile: boolean;
  firstCustomer: boolean;
  firstDriver: boolean;
  firstVehicle: boolean;
  firstOrder: boolean;
}

export interface OnboardingProgress {
  organizationId: string;
  completed: boolean;
  skipped: boolean;
  steps: OnboardingSteps;
  skippedAt?: string;
}

export const onboardingKeys = {
  progress: ['onboarding', 'progress'] as const,
};

async function getProgress(): Promise<OnboardingProgress> {
  const response = await apiFetch('/api/onboarding/progress', { method: 'GET' });
  return unwrapResponse<OnboardingProgress>(response, 'Failed to load setup progress');
}

export function useOnboardingProgressQuery(enabled = true) {
  return useQuery({
    queryKey: onboardingKeys.progress,
    queryFn: getProgress,
    enabled,
    staleTime: 30_000,
  });
}

export function useSkipOnboardingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/onboarding/skip', { method: 'POST' });
      return unwrapResponse<OnboardingProgress>(response, 'Failed to dismiss setup');
    },
    onSuccess: (progress) => {
      queryClient.setQueryData(onboardingKeys.progress, progress);
    },
  });
}
