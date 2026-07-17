import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalProfileKeys } from './portal-query-keys';
import { describeError } from './describe-error';

export interface PortalProfile {
  id: string;
  customerCode: string;
  companyName: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  creditLimit: string | null;
  deliveryNotes: string | null;
}

export interface PortalProfileUpdateInput {
  contactName?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface PortalProfileUpdateResponse {
  contactName: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

class PortalProfileAPI {
  private baseUrl = '/api/customer-portal/profile';

  async get(): Promise<PortalProfile> {
    const response = await portalFetch(this.baseUrl, { method: 'GET' });
    return unwrap(response, 'Failed to fetch profile');
  }

  async update(input: PortalProfileUpdateInput): Promise<PortalProfileUpdateResponse> {
    const response = await portalFetch(this.baseUrl, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrap(response, 'Failed to update profile');
  }
}

export const portalProfileAPI = new PortalProfileAPI();

export function usePortalProfile() {
  const result = useQuery({
    queryKey: portalProfileKeys.data(),
    queryFn: () => portalProfileAPI.get(),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load profile') : null,
    refetch: result.refetch,
  };
}

export function usePortalProfileUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PortalProfileUpdateInput) => portalProfileAPI.update(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: portalProfileKeys.data() }),
  });
}
