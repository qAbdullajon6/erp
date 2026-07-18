import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import { describeError } from './describe-error';

export type CustomerPortalAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type CustomerPortalInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface CustomerPortalInvitationSummary {
  id: string;
  customerId: string;
  email: string;
  status: CustomerPortalInvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface CustomerPortalAccessStatus {
  hasAccount: boolean;
  accountStatus: CustomerPortalAccountStatus | null;
  email: string | null;
  lastLoginAt: string | null;
  pendingInvitation: CustomerPortalInvitationSummary | null;
}

const portalAccessKeys = {
  status: (customerId: string) => ['customer-portal-access', customerId] as const,
};

class CustomerPortalProvisioningAPI {
  private baseUrl(customerId: string) {
    return `/api/customers/${customerId}/portal-access`;
  }

  async getStatus(customerId: string): Promise<CustomerPortalAccessStatus> {
    const response = await apiFetch(this.baseUrl(customerId));
    return unwrapResponse(response, 'Failed to load portal access status');
  }

  async invite(customerId: string): Promise<CustomerPortalInvitationSummary> {
    const response = await apiFetch(`${this.baseUrl(customerId)}/invitations`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to send portal invitation');
  }

  async resend(customerId: string, invitationId: string): Promise<CustomerPortalInvitationSummary> {
    const response = await apiFetch(`${this.baseUrl(customerId)}/invitations/${invitationId}/resend`, {
      method: 'POST',
    });
    return unwrapResponse(response, 'Failed to resend portal invitation');
  }

  async revoke(customerId: string, invitationId: string): Promise<CustomerPortalInvitationSummary> {
    const response = await apiFetch(`${this.baseUrl(customerId)}/invitations/${invitationId}/revoke`, {
      method: 'POST',
    });
    return unwrapResponse(response, 'Failed to revoke portal invitation');
  }

  async suspend(customerId: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl(customerId)}/suspend`, { method: 'POST' });
    await unwrapResponse(response, 'Failed to suspend portal access');
  }

  async reactivate(customerId: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl(customerId)}/reactivate`, { method: 'POST' });
    await unwrapResponse(response, 'Failed to reactivate portal access');
  }
}

export const customerPortalProvisioningAPI = new CustomerPortalProvisioningAPI();

export function useCustomerPortalAccessStatus(customerId: string) {
  const result = useQuery({
    queryKey: portalAccessKeys.status(customerId),
    queryFn: () => customerPortalProvisioningAPI.getStatus(customerId),
    enabled: Boolean(customerId),
  });

  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error ? describeError(result.error, 'Failed to load portal access status') : null,
    refetch: result.refetch,
  };
}

function useInvalidateAccessStatus(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: portalAccessKeys.status(customerId) });
}

export function useInviteToPortal(customerId: string) {
  const invalidate = useInvalidateAccessStatus(customerId);
  const mutation = useMutation({
    mutationFn: () => customerPortalProvisioningAPI.invite(customerId),
    onSuccess: invalidate,
  });
  return {
    invite: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error ? describeError(mutation.error, 'Failed to send portal invitation') : null,
  };
}

export function useResendPortalInvitation(customerId: string) {
  const invalidate = useInvalidateAccessStatus(customerId);
  const mutation = useMutation({
    mutationFn: (invitationId: string) => customerPortalProvisioningAPI.resend(customerId, invitationId),
    onSuccess: invalidate,
  });
  return { resend: mutation.mutateAsync, loading: mutation.isPending };
}

export function useRevokePortalInvitation(customerId: string) {
  const invalidate = useInvalidateAccessStatus(customerId);
  const mutation = useMutation({
    mutationFn: (invitationId: string) => customerPortalProvisioningAPI.revoke(customerId, invitationId),
    onSuccess: invalidate,
  });
  return { revoke: mutation.mutateAsync, loading: mutation.isPending };
}

export function useSuspendPortalAccess(customerId: string) {
  const invalidate = useInvalidateAccessStatus(customerId);
  const mutation = useMutation({
    mutationFn: () => customerPortalProvisioningAPI.suspend(customerId),
    onSuccess: invalidate,
  });
  return { suspend: mutation.mutateAsync, loading: mutation.isPending };
}

export function useReactivatePortalAccess(customerId: string) {
  const invalidate = useInvalidateAccessStatus(customerId);
  const mutation = useMutation({
    mutationFn: () => customerPortalProvisioningAPI.reactivate(customerId),
    onSuccess: invalidate,
  });
  return { reactivate: mutation.mutateAsync, loading: mutation.isPending };
}
