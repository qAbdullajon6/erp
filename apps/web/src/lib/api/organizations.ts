import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type MembershipRole = 'ADMIN' | 'OPERATIONS_MANAGER' | 'DISPATCHER' | 'ACCOUNTANT' | 'DRIVER' | 'SALES_CRM_MANAGER';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'REMOVED';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  timezone: string;
}

export interface Member {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface UpdateOrganizationInput {
  name?: string;
  defaultCurrency?: string;
  timezone?: string;
}

export interface AddMemberInput {
  email: string;
  role: MembershipRole;
}

export interface UpdateMemberInput {
  role?: MembershipRole;
  status?: MembershipStatus;
}

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || fallbackMessage);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class OrganizationsAPI {
  async getCurrent(): Promise<Organization> {
    const response = await apiFetch('/api/organizations/current', { method: 'GET' });
    return unwrap(response, 'Failed to fetch organization');
  }

  async updateCurrent(input: UpdateOrganizationInput): Promise<Organization> {
    const response = await apiFetch('/api/organizations/current', { method: 'PATCH', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to update organization');
  }

  async listMembers(): Promise<Member[]> {
    const response = await apiFetch('/api/organizations/current/members', { method: 'GET' });
    return unwrap(response, 'Failed to fetch members');
  }

  async addMember(input: AddMemberInput): Promise<Member> {
    const response = await apiFetch('/api/organizations/current/members', { method: 'POST', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to add member');
  }

  async updateMember(membershipId: string, input: UpdateMemberInput): Promise<Member> {
    const response = await apiFetch(`/api/organizations/current/members/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrap(response, 'Failed to update member');
  }

  async removeMember(membershipId: string): Promise<{ id: string; status: string }> {
    const response = await apiFetch(`/api/organizations/current/members/${membershipId}`, { method: 'DELETE' });
    return unwrap(response, 'Failed to remove member');
  }
}

export const organizationsAPI = new OrganizationsAPI();

export function useOrganizationQuery() {
  return useQuery({ queryKey: ['organization'], queryFn: () => organizationsAPI.getCurrent() });
}

export function useUpdateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrganizationInput) => organizationsAPI.updateCurrent(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization'] }),
  });
}

export function useMembersQuery(enabled = true) {
  return useQuery({ queryKey: ['organization-members'], queryFn: () => organizationsAPI.listMembers(), enabled });
}

export function useAddMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberInput) => organizationsAPI.addMember(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization-members'] }),
  });
}

export function useUpdateMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, input }: { membershipId: string; input: UpdateMemberInput }) =>
      organizationsAPI.updateMember(membershipId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization-members'] }),
  });
}

export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => organizationsAPI.removeMember(membershipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization-members'] }),
  });
}
