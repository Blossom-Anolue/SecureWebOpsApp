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
  user_id: string;
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
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      // Step 1: Create the organization record
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name,
          slug,
          created_by: user!.id,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Step 2: Add the creator as an owner
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: org.id,
          user_id: user!.id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      return org as Organization;
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
      // Create a pending invitation record
      // The placeholder user_id indicates this is an unaccepted invitation
      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: '00000000-0000-0000-0000-000000000000', // Placeholder for pending invites
          role,
          invited_email: email,
          invited_at: new Date().toISOString(),
          joined_at: null, // Will be set when user accepts
        })
        .select()
        .single();

      if (error) throw error;
      return data as OrganizationMember;
    },
    onSuccess: (_, variables) => {
      // Refresh the members list for this organization
      queryClient.invalidateQueries({ queryKey: ['organization_members', variables.organizationId] });
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
