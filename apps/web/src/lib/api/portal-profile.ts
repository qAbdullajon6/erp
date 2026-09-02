import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalProfileKeys, portalNotificationPreferenceKeys } from './portal-query-keys';
import { describeError } from './describe-error';

export interface PortalNotificationPreferences {
  shipmentAssigned: boolean;
  shipmentDelayed: boolean;
  shipmentDelivered: boolean;
  invoiceCreated: boolean;
  invoiceOverdue: boolean;
  paymentReceived: boolean;
  documentsAvailable: boolean;
}

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
  paymentTermsDays: number | null;
  creditLimit: string | null;
  deliveryNotes: string | null;
  language: string;
  timezone: string;
  notificationPreferences: PortalNotificationPreferences;
}

export interface PortalProfileUpdateInput {
  contactName?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  language?: string;
  timezone?: string;
  notificationPreferences?: Partial<PortalNotificationPreferences>;
}

export interface PortalProfileUpdateResponse {
  contactName: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  language: string;
  timezone: string;
  notificationPreferences: PortalNotificationPreferences;
}

class PortalProfileAPI {
  private baseUrl = '/api/customer-portal/profile';
  private prefsUrl = '/api/customer-portal/notifications/preferences';

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

  async getPreferences(): Promise<{
    preferences: PortalNotificationPreferences;
    language: string;
    timezone: string;
  }> {
    const response = await portalFetch(this.prefsUrl, { method: 'GET' });
    return unwrap(response, 'Failed to fetch notification preferences');
  }

  async updatePreferences(input: {
    preferences?: Partial<PortalNotificationPreferences>;
    language?: string;
    timezone?: string;
  }) {
    const response = await portalFetch(this.prefsUrl, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrap(response, 'Failed to update notification preferences');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalProfileKeys.data() });
      queryClient.invalidateQueries({ queryKey: portalNotificationPreferenceKeys.data() });
    },
  });
}
