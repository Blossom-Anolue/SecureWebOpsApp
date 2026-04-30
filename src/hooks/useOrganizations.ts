/**
 * @fileoverview Organization Management Hooks
 * 
 * This file provides hooks for managing teams/organizations and their members.
 * Organizations allow multiple users to collaborate on security monitoring
 * for shared domains.
 * 
 * Features:
 * - Create and manage organizations
 * - Invite and manage team members
 * - Role-based access control (owner, admin, member, viewer)
 * 
 * @module hooks/useOrganizations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const apiBaseUrl = import.meta.env.VITE_API_PROXY_TARGET?.replace(/\/$/, '') || '';

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('You must be signed in to perform this action.');
  }

  return accessToken;
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const requestUrl = apiBaseUrl && path.startsWith('/api/') ? `${apiBaseUrl}${path}` : path;

  const response = await fetch(requestUrl, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const responseText = await response.text();
  let payload: any = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      responseText ||
      `Request failed (${response.status})`
    );
  }

  return payload as T;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Role types available for organization members.
 * Roles determine what actions a member can perform.
 * 
 * - owner: Full control, can delete organization
 * - admin: Can manage members and settings
 * - member: Can run scans and view results
 * - viewer: Read-only access to view results
 */
export type AppRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Represents a team/organization.
 * Organizations are containers for shared security monitoring.
 */
export interface Organization {
  /** Unique identifier for the organization */
  id: string;
  /** Display name of the organization */
  name: string;
  /** URL-friendly slug for the organization */
  slug: string;
  /** ID of the user who created the organization */
  created_by: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Represents a member of an organization.
 * Links a user to an organization with a specific role.
 */
export interface OrganizationMember {
  /** Unique identifier for the membership record */
  id: string;
  /** ID of the organization */
  organization_id: string;
  /** ID of the user (or placeholder for pending invites) */
  user_id: string | null;
  /** Role of the member within the organization */
  role: AppRole;
  /** Email address used for the invitation */
  invited_email: string | null;
  /** Timestamp when the invitation was sent */
  invited_at: string | null;
  /** Timestamp when the user accepted the invitation */
  joined_at: string | null;
  /** Record creation timestamp */
  created_at: string;
  organizations?: Pick<Organization, 'id' | 'name' | 'slug'> | null;
}

// ============================================================================
// ORGANIZATION HOOKS
// ============================================================================

/**
 * Fetches all organizations the current user is a member of.
 * Results are ordered by creation time, newest first.
 * 
 * @returns Query result containing array of Organization objects
 */
export function useOrganizations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['organizations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Organization[];
    },
    enabled: !!user,
  });
}

/**
 * Fetches a single organization by its ID.
 * 
 * @param orgId - The unique identifier of the organization
 * @returns Query result containing the Organization object
 */
export function useOrganization(orgId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['organization', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId!)
        .single();

      if (error) throw error;
      return data as Organization;
    },
    enabled: !!user && !!orgId,
  });
}

/**
 * Fetches all members of a specific organization.
 * Includes both active members and pending invitations.
 * 
 * @param orgId - The unique identifier of the organization
 * @returns Query result containing array of OrganizationMember objects
 */
export function useOrganizationMembers(orgId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['organization_members', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as OrganizationMember[];
    },
    enabled: !!user && !!orgId,
  });
}

/**
 * Fetches pending invites addressed to the signed-in user's email.
 *
 * @returns Query result containing array of pending invitations
 */
export function usePendingInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending_invites', user?.id, user?.email],
    queryFn: async () => {
      const normalizedEmail = user?.email?.toLowerCase();
      if (!normalizedEmail) return [];

      const { data, error } = await supabase
        .from('organization_members')
        .select('*, organizations(id, name, slug)')
        .is('joined_at', null)
        .eq('invited_email', normalizedEmail)
        .order('invited_at', { ascending: false });

      if (error) throw error;

      const uniqueInvites = new Map<string, OrganizationMember>();
      for (const invite of (data as OrganizationMember[]) ?? []) {
        const key = `${invite.organization_id}:${invite.invited_email}:${invite.role}`;
        if (!uniqueInvites.has(key)) {
          uniqueInvites.set(key, invite);
        }
      }

      return Array.from(uniqueInvites.values());
    },
    enabled: !!user?.email,
  });
}

/**
 * Mutation hook for creating a new organization.
 * The creating user is automatically added as an 'owner'.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 * 
 * @example
 * const createOrg = useCreateOrganization();
 * await createOrg.mutateAsync({
 *   name: 'My Company',
 *   slug: 'my-company'
 * });
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const payload = await apiRequest<{ organization: Organization }>('/api/user/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
        }),
      });

      return payload.organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

/**
 * Mutation hook for updating organization details.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Organization> }) => {
      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Organization;
    },
    onSuccess: (data) => {
      // Invalidate both the list and the specific org
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization', data.id] });
    },
  });
}

// ============================================================================
// MEMBER MANAGEMENT HOOKS
// ============================================================================

/**
 * Mutation hook for inviting a new member to an organization.
 * Creates a pending membership record with the invited email.
 * 
 * Note: In production, this would also send an email invitation.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 * 
 * @example
 * const invite = useInviteMember();
 * await invite.mutateAsync({
 *   organizationId: 'org-uuid',
 *   email: 'newmember@example.com',
 *   role: 'member'
 * });
 */
export function useInviteMember() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      organizationId,
      email,
      role,
    }: {
      organizationId: string;
      email: string;
      role: AppRole;
    }) => {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail) {
        throw new Error('Please enter an email address.');
      }

      if (user?.email && normalizedEmail === user.email.toLowerCase()) {
        throw new Error('You are already on this team.');
      }

      const payload = await apiRequest<{ invitation: OrganizationMember }>(
        `/api/user/organizations/${organizationId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: normalizedEmail,
            role,
          }),
        }
      );

      return payload.invitation;
    },
    onSuccess: (_, variables) => {
      // Refresh the members list for this organization
      queryClient.invalidateQueries({ queryKey: ['organization_members', variables.organizationId] });
    },
  });
}

/**
 * Mutation hook for accepting a pending team invitation.
 */
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ membershipId, organizationId }: { membershipId: string; organizationId: string }) => {
      const payload = await apiRequest<{ membership: OrganizationMember }>(
        `/api/user/organizations/${organizationId}/invitations/${membershipId}/accept`,
        {
          method: 'POST',
        }
      );

      return payload.membership;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pending_invites'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization_members', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['user_role', variables.organizationId] });
    },
  });
}

/**
 * Mutation hook for declining a pending team invitation.
 */
export function useDeclineInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ membershipId, organizationId }: { membershipId: string; organizationId: string }) => {
      await apiRequest<{ success: boolean }>(
        `/api/user/organizations/${organizationId}/invitations/${membershipId}`,
        {
          method: 'DELETE',
        }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pending_invites'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization_members', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['user_role', variables.organizationId] });
    },
  });
}

/**
 * Mutation hook for changing a member's role.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 * 
 * @example
 * const updateRole = useUpdateMemberRole();
 * await updateRole.mutateAsync({
 *   memberId: 'member-uuid',
 *   organizationId: 'org-uuid',
 *   role: 'admin'
 * });
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      organizationId,
      role,
    }: {
      memberId: string;
      organizationId: string;
      role: AppRole;
    }) => {
      const { data, error } = await supabase
        .from('organization_members')
        .update({ role })
        .eq('id', memberId)
        .select()
        .single();

      if (error) throw error;
      return data as OrganizationMember;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organization_members', variables.organizationId] });
    },
  });
}

/**
 * Mutation hook for removing a member from an organization.
 * Can be used to remove active members or cancel pending invitations.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, organizationId }: { memberId: string; organizationId: string }) => {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organization_members', variables.organizationId] });
    },
  });
}

// ============================================================================
// PERMISSION HOOKS
// ============================================================================

/**
 * Fetches the current user's role within a specific organization.
 * Useful for determining what actions the user can perform.
 * 
 * @param orgId - The unique identifier of the organization
 * @returns Query result containing the user's role or null if not a member
 * 
 * @example
 * const { data: role } = useCurrentUserRole('org-uuid');
 * if (role === 'owner' || role === 'admin') {
 *   // Show admin controls
 * }
 */
export function useCurrentUserRole(orgId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user_role', orgId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId!)
        .eq('user_id', user!.id)
        .maybeSingle(); // Returns null if user is not a member

      if (error) throw error;
      return data?.role as AppRole | null;
    },
    enabled: !!user && !!orgId,
  });
}
