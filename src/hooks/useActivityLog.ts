/**
 * @fileoverview Activity Log Hooks
 * 
 * This file provides hooks for tracking and displaying user activity
 * within the application. Activities are logged for audit purposes and
 * to help users understand what actions have been taken.
 * 
 * Activity logging is crucial for:
 * - Security auditing
 * - Team collaboration (seeing what others did)
 * - Debugging and support
 * 
 * @module hooks/useActivityLog
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * All possible activity actions that can be logged.
 * Actions follow a 'resource.verb' naming convention.
 */
export type ActivityAction = 
  | 'scan.started'        // User initiated a security scan
  | 'scan.completed'      // Scan finished successfully
  | 'scan.failed'         // Scan encountered an error
  | 'domain.added'        // User added a new domain
  | 'domain.removed'      // User removed a domain
  | 'schedule.created'    // User created a scan schedule
  | 'schedule.updated'    // User modified a scan schedule
  | 'schedule.deleted'    // User deleted a scan schedule
  | 'team.created'        // User created a team/organization
  | 'team.updated'        // Team settings were modified
  | 'member.invited'      // User invited a team member
  | 'member.joined'       // Invited member accepted and joined
  | 'member.removed'      // Team member was removed
  | 'member.role_changed' // Team member's role was changed
  | 'phishing.checked'    // User performed a phishing check
  | 'report.downloaded'   // User downloaded a PDF report
  | 'settings.updated';   // User updated their settings

/**
 * Types of resources that can have activities logged against them.
 */
export type ResourceType = 
  | 'scan'
  | 'domain'
  | 'schedule'
  | 'organization'
  | 'member'
  | 'phishing_check'
  | 'report'
  | 'settings';

/**
 * Represents a single activity log entry.
 * Contains all information needed to display and audit the activity.
 */
export interface ActivityLog {
  /** Unique identifier for the log entry */
  id: string;
  /** Organization ID if action was within a team context */
  organization_id: string | null;
  /** ID of the user who performed the action */
  user_id: string;
  /** The specific action that was performed */
  action: ActivityAction;
  /** Type of resource the action was performed on */
  resource_type: ResourceType;
  /** ID of the specific resource (e.g., scan ID, domain ID) */
  resource_id: string | null;
  /** Additional context about the action (JSON object) */
  details: Record<string, any>;
  /** IP address of the user (for security auditing) */
  ip_address: string | null;
  /** User agent string (browser/device info) */
  user_agent: string | null;
  /** Timestamp when the activity occurred */
  created_at: string;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetches activity logs for the current user or organization.
 * 
 * @param organizationId - Optional org ID to filter by organization
 * @param limit - Maximum number of logs to fetch (default: 50)
 * @returns Query result containing array of ActivityLog objects
 * 
 * @example
 * // Get personal activity logs
 * const { data: logs } = useActivityLogs();
 * 
 * @example
 * // Get organization activity logs
 * const { data: logs } = useActivityLogs('org-id-123');
 */
export function useActivityLogs(organizationId?: string, limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['activity_logs', organizationId, limit],
    queryFn: async () => {
      // Build the query with appropriate filtering
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (organizationId) {
        // If org ID provided, filter by organization
        query = query.eq('organization_id', organizationId);
      } else {
        // Otherwise, filter by current user
        query = query.eq('user_id', user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ActivityLog[];
    },
    enabled: !!user, // Only run when user is authenticated
  });
}

/**
 * Mutation hook for logging a new activity.
 * Automatically captures user agent information.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 * 
 * @example
 * const logActivity = useLogActivity();
 * logActivity.mutate({
 *   action: 'scan.started',
 *   resourceType: 'scan',
 *   resourceId: 'scan-uuid',
 *   details: { domain: 'example.com' }
 * });
 */
export function useLogActivity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      action,
      resourceType,
      resourceId,
      organizationId,
      details = {},
    }: {
      action: ActivityAction;
      resourceType: ResourceType;
      resourceId?: string;
      organizationId?: string;
      details?: Record<string, any>;
    }) => {
      const { data, error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: user!.id,
          action,
          resource_type: resourceType,
          resource_id: resourceId || null,
          organization_id: organizationId || null,
          details,
          user_agent: navigator.userAgent, // Capture browser/device info
        })
        .select()
        .single();

      if (error) throw error;
      return data as ActivityLog;
    },
    onSuccess: () => {
      // Refresh the activity logs list
      queryClient.invalidateQueries({ queryKey: ['activity_logs'] });
    },
  });
}

/**
 * Helper hook that provides a simplified interface for logging activities.
 * Wraps useLogActivity with a more convenient API.
 * 
 * @returns Object with `log` function and `isLogging` state
 * 
 * @example
 * const { log, isLogging } = useActivityLogger();
 * 
 * // Log an activity
 * log('scan.started', 'scan', {
 *   resourceId: 'scan-uuid',
 *   details: { domain: 'example.com', scanType: 'quick' }
 * });
 */
export function useActivityLogger() {
  const logActivity = useLogActivity();

  /**
   * Logs an activity with the given parameters.
   * 
   * @param action - The action being performed
   * @param resourceType - Type of resource being acted upon
   * @param options - Optional additional context
   */
  const log = (
    action: ActivityAction,
    resourceType: ResourceType,
    options?: {
      resourceId?: string;
      organizationId?: string;
      details?: Record<string, any>;
    }
  ) => {
    logActivity.mutate({
      action,
      resourceType,
      resourceId: options?.resourceId,
      organizationId: options?.organizationId,
      details: options?.details || {},
    });
  };

  return { log, isLogging: logActivity.isPending };
}
