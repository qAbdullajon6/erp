import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

export interface ValidatedCustomerPortalInvitation {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  customerCompanyName: string;
  email: string;
  expiresAt: string;
}

export interface AcceptCustomerPortalInvitationInput {
  token: string;
  password: string;
}

export interface AcceptCustomerPortalInvitationResult {
  accountId: string;
  customerId: string;
  organizationId: string;
}

class CustomerPortalInvitationsAPI {
  async validate(token: string): Promise<ValidatedCustomerPortalInvitation> {
    const response = await apiFetch(`/api/customer-portal/invitations/${encodeURIComponent(token)}`, {
      method: 'GET',
      skipAuth: true,
    });
    return unwrapResponse(response, 'Failed to validate invitation');
  }

  async accept(
    input: AcceptCustomerPortalInvitationInput,
  ): Promise<AcceptCustomerPortalInvitationResult> {
    const response = await apiFetch('/api/customer-portal/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    return unwrapResponse(response, 'Failed to accept invitation');
  }
}

export const customerPortalInvitationsAPI = new CustomerPortalInvitationsAPI();

/// Public: validate the token behind the activation page. Disabled until a
/// token is present; 4xx (invalid/expired/revoked/accepted) is surfaced, not
/// retried.
export function useValidateCustomerPortalInvitation(token: string) {
  return useQuery({
    queryKey: ['customer-portal-invitation', token],
    queryFn: () => customerPortalInvitationsAPI.validate(token),
    enabled: token.length > 0,
  });
}

/// Public: accept an invitation. No cache to invalidate — no customer-portal
/// session is created by this call; signing in is a separate step.
export function useAcceptCustomerPortalInvitation() {
  return useMutation({
    mutationFn: (input: AcceptCustomerPortalInvitationInput) => customerPortalInvitationsAPI.accept(input),
  });
}
