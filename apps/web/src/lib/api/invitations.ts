import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import type { MembershipRole } from './organizations';

/// Frontend API layer for staff invitations. Mirrors the backend contract
/// (apps/api/src/invitations): a public token flow the invitee uses before any
/// session exists, and admin-only management routes. Reuses the shared apiFetch
/// (auth + single-flight refresh) and unwrapResponse (the `{ data }` envelope +
/// ApiError with the server's own message, which the global QueryClient retry
/// policy treats as non-retryable for 4xx). No UI, toast, or navigation here.

/// Invitation lifecycle, matching the backend InvitationStatus enum. Distinct
/// from MembershipRole/MembershipStatus (reused from ./organizations).
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

/// Response of GET /invite/:token — the safe, display-ready details the accept
/// page needs. Dates arrive as ISO strings over JSON.
export interface ValidatedInvitation {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: MembershipRole;
  inviterDisplayName: string | null;
  expiresAt: string;
}

/// Body of POST /invite/accept.
export interface AcceptInvitationInput {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}

/// Response of POST /invite/accept. No token or session is returned — signing
/// in is a separate flow.
export interface AcceptInvitationResult {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

/// The admin-facing invitation summary returned by create/resend/revoke.
export interface Invitation {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  status: InvitationStatus;
}

/// One row of GET /organizations/:organizationId/invitations. The list carries
/// `createdAt` (the mutation summaries do not); it never carries a token,
/// token hash, or accept URL — the backend selects only these columns.
export interface InvitationListItem extends Invitation {
  createdAt: string;
}

/// Body of POST /organizations/:organizationId/invitations. The organization
/// comes from the path and the inviter from the session — neither is sent here.
export interface CreateInvitationInput {
  email: string;
  role: MembershipRole;
}

class InvitationsAPI {
  /// Public: validate a token before rendering the accept page. `skipAuth` —
  /// the invitee has no session, so no bearer token is attached and a 401 is
  /// never turned into a refresh attempt.
  async validate(token: string): Promise<ValidatedInvitation> {
    const response = await apiFetch(`/api/invite/${encodeURIComponent(token)}`, {
      method: 'GET',
      skipAuth: true,
    });
    return unwrapResponse(response, 'Failed to validate invitation');
  }

  /// Public: accept an invitation, provisioning the user + membership.
  async accept(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const response = await apiFetch('/api/invite/accept', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    return unwrapResponse(response, 'Failed to accept invitation');
  }

  /// Admin: the organization's invitations, newest first.
  async list(organizationId: string): Promise<InvitationListItem[]> {
    const response = await apiFetch(`/api/organizations/${organizationId}/invitations`, {
      method: 'GET',
    });
    return unwrapResponse(response, 'Failed to load invitations');
  }

  /// Admin (ADMIN of the organization): invite a new staff member.
  async create(organizationId: string, input: CreateInvitationInput): Promise<Invitation> {
    const response = await apiFetch(`/api/organizations/${organizationId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapResponse(response, 'Failed to create invitation');
  }

  /// Admin: rotate an invitation's token and re-send its email.
  async resend(organizationId: string, invitationId: string): Promise<Invitation> {
    const response = await apiFetch(
      `/api/organizations/${organizationId}/invitations/${invitationId}/resend`,
      { method: 'POST' },
    );
    return unwrapResponse(response, 'Failed to resend invitation');
  }

  /// Admin: revoke a pending invitation.
  async revoke(organizationId: string, invitationId: string): Promise<Invitation> {
    const response = await apiFetch(
      `/api/organizations/${organizationId}/invitations/${invitationId}/revoke`,
      { method: 'POST' },
    );
    return unwrapResponse(response, 'Failed to revoke invitation');
  }
}

export const invitationsAPI = new InvitationsAPI();

/// Query key for an organization's pending invitations. Admin mutations
/// invalidate it so a future invitations list stays fresh — the same
/// invalidate-the-list pattern useUpdateMemberMutation uses for members.
const invitationsKey = (organizationId: string) => ['organization-invitations', organizationId] as const;

/// Admin: the organization's invitations. Keyed exactly as the mutations
/// invalidate, so create/resend/revoke refresh this list on their own — no
/// manual cache editing anywhere.
export function useInvitationsQuery(organizationId: string | undefined) {
  return useQuery({
    queryKey: invitationsKey(organizationId ?? ''),
    queryFn: () => invitationsAPI.list(organizationId ?? ''),
    enabled: Boolean(organizationId),
  });
}

/// Public: validate the token behind the accept page. Disabled until a token is
/// present; 4xx (invalid/expired/revoked/accepted) is surfaced, not retried.
export function useValidateInvitation(token: string) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => invitationsAPI.validate(token),
    enabled: token.length > 0,
  });
}

/// Public: accept an invitation. No cache to invalidate (no session is created).
export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (input: AcceptInvitationInput) => invitationsAPI.accept(input),
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, input }: { organizationId: string; input: CreateInvitationInput }) =>
      invitationsAPI.create(organizationId, input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: invitationsKey(variables.organizationId) }),
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, invitationId }: { organizationId: string; invitationId: string }) =>
      invitationsAPI.resend(organizationId, invitationId),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: invitationsKey(variables.organizationId) }),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, invitationId }: { organizationId: string; invitationId: string }) =>
      invitationsAPI.revoke(organizationId, invitationId),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: invitationsKey(variables.organizationId) }),
  });
}
