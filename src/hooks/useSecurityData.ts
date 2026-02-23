/**
 * @fileoverview Security Data Hooks
 * 
 * This file contains all React Query hooks for managing security-related data
 * including domains, scans, phishing checks, security scores, user profiles,
 * notification settings, and scan schedules.
 * 
 * All hooks follow a consistent pattern:
 * - Query hooks for fetching data (useDomains, useScans, etc.)
 * - Mutation hooks for creating/updating data (useAddDomain, useCreateScan, etc.)
 * 
 * @module hooks/useSecurityData
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Represents a website domain registered by the user for security monitoring.
 * Domains are the primary entities that security scans are run against.
 */
export interface Domain {
  /** Unique identifier for the domain */
  id: string;
  /** ID of the user who owns this domain */
  user_id: string;
  /** The domain name (e.g., "example.com") */
  domain: string;
  /** Whether domain ownership has been verified */
  is_verified: boolean;
  /** Whether this is the user's primary/main domain */
  is_primary: boolean;
  /** Timestamp when the domain was added */
  created_at: string;
}

/**
 * Represents a security scan performed on a domain.
 * Scans analyze websites for OWASP Top 10 vulnerabilities and other security issues.
 */
export interface Scan {
  /** Unique identifier for the scan */
  id: string;
  /** ID of the user who initiated the scan */
  user_id: string;
  /** ID of the domain being scanned */
  domain_id: string;
  /** The domain name being scanned */
  domain: string;
  /** Type of scan: 'quick' (~5 min) or 'full' (~15-30 min) */
  scan_type: 'quick' | 'full';
  /** Current status of the scan */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Overall security score (0-100), null if not completed */
  score: number | null;
  /** Count of critical severity issues found */
  critical_count: number;
  /** Count of high severity issues found */
  high_count: number;
  /** Count of medium severity issues found */
  medium_count: number;
  /** Count of low severity issues found */
  low_count: number;
  /** Timestamp when the scan was started */
  started_at: string;
  /** Timestamp when the scan completed, null if still running */
  completed_at: string | null;
}

/**
 * Represents a security issue found during a scan.
 * Issues include detailed information for both technical and non-technical users.
 */
export interface ScanIssue {
  /** Unique identifier for the issue */
  id: string;
  /** ID of the scan that found this issue */
  scan_id: string;
  /** ID of the user who owns the scan */
  user_id: string;
  /** Short, descriptive title of the issue */
  title: string;
  /** Severity level of the issue */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Category of the security issue (e.g., "Authentication", "Encryption") */
  category: string;
  /** OWASP Top 10 category if applicable */
  owasp_category: string | null;
  /** Plain-language description of the issue */
  description: string;
  /** Explanation of potential business impact in non-technical terms */
  business_impact: string;
  /** Actionable steps to fix the issue */
  recommendation: string;
  /** Technical details for developers (optional) */
  technical_details: string | null;
  /** Whether the issue has been resolved */
  is_resolved: boolean;
  /** Timestamp when the issue was created */
  created_at: string;
}

/**
 * Represents a phishing check performed on an email or link.
 * Uses AI to analyze content for phishing indicators.
 */
export interface PhishingCheck {
  /** Unique identifier for the check */
  id: string;
  /** ID of the user who performed the check */
  user_id: string;
  /** Type of content checked */
  check_type: 'email' | 'link';
  /** The content that was analyzed */
  content: string;
  /** Email subject line (if applicable) */
  subject: string | null;
  /** Sender email address (if applicable) */
  sender_email: string | null;
  /** Assessed risk level */
  risk_level: 'high' | 'medium' | 'low';
  /** Plain-language verdict about the content */
  verdict: string;
  /** Timestamp when the check was performed */
  checked_at: string;
}

/**
 * Represents a red flag identified during a phishing check.
 * Each red flag explains a specific suspicious element found.
 */
export interface PhishingRedFlag {
  /** Unique identifier for the red flag */
  id: string;
  /** ID of the phishing check this flag belongs to */
  check_id: string;
  /** ID of the user who owns the check */
  user_id: string;
  /** Short title describing the red flag */
  title: string;
  /** Detailed explanation of why this is suspicious */
  description: string;
  /** Severity level of this red flag */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Represents a historical security score record.
 * Used to track security posture over time.
 */
export interface SecurityScore {
  /** Unique identifier for the score record */
  id: string;
  /** ID of the user this score belongs to */
  user_id: string;
  /** The security score value (0-100) */
  score: number;
  /** Timestamp when this score was recorded */
  recorded_at: string;
}

/**
 * Represents a user's business profile information.
 * Used for industry benchmarking and personalization.
 */
export interface Profile {
  /** User ID (matches auth.users) */
  id: string;
  /** Name of the user's business */
  business_name: string | null;
  /** Industry category for benchmarking */
  industry: string | null;
  /** Profile creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Represents user notification preferences.
 * Controls how and when the user receives alerts.
 */
export interface NotificationSettings {
  /** Unique identifier for the settings record */
  id: string;
  /** User ID these settings belong to */
  user_id: string;
  /** Whether to receive email notifications */
  email_notifications: boolean;
  /** Whether to receive immediate alerts for critical issues */
  critical_alerts: boolean;
  /** Whether to receive weekly summary reports */
  weekly_summary: boolean;
  /** Last update timestamp */
  updated_at: string;
}

// ============================================================================
// DOMAINS HOOKS
// ============================================================================

/**
 * Fetches all domains registered by the current user.
 * 
 * @returns Query result containing array of Domain objects
 * 
 * @example
 * const { data: domains, isLoading } = useDomains();
 */
export function useDomains() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['domains', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('domains')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Domain[];
    },
    enabled: !!user, // Only run query when user is authenticated
  });
}

/**
 * Mutation hook for adding a new domain to monitor.
 * Automatically invalidates the domains cache on success.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 * 
 * @example
 * const addDomain = useAddDomain();
 * await addDomain.mutateAsync('example.com');
 */
export function useAddDomain() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (domain: string) => {
      const { data, error } = await supabase
        .from('domains')
        .insert({ domain, user_id: user!.id })
        .select()
        .single();
      
      if (error) throw error;
      return data as Domain;
    },
    onSuccess: () => {
      // Invalidate domains cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });
}

// ============================================================================
// SCANS HOOKS
// ============================================================================

/**
 * Fetches all security scans for the current user.
 * Results are ordered by start time, newest first.
 * 
 * @returns Query result containing array of Scan objects
 */
export function useScans() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['scans', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      return data as Scan[];
    },
    enabled: !!user,
  });
}

/**
 * Fetches a single scan by its ID.
 * 
 * @param scanId - The unique identifier of the scan to fetch
 * @returns Query result containing the Scan object or null
 */
export function useScan(scanId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['scan', scanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scans')
        .select('*')
        .eq('id', scanId)
        .maybeSingle(); // Returns null if not found instead of error
      
      if (error) throw error;
      return data as Scan | null;
    },
    enabled: !!user && !!scanId,
  });
}

/**
 * Fetches all security issues found in a specific scan.
 * Results are ordered by creation time, newest first.
 * 
 * @param scanId - The unique identifier of the scan
 * @returns Query result containing array of ScanIssue objects
 */
export function useScanIssues(scanId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['scan_issues', scanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scan_issues')
        .select('*')
        .eq('scan_id', scanId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ScanIssue[];
    },
    enabled: !!user && !!scanId,
  });
}

/**
 * Mutation hook for creating a new security scan.
 * Creates the scan record and triggers the AI-powered security-scan edge function.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 * 
 * @example
 * const createScan = useCreateScan();
 * await createScan.mutateAsync({
 *   domainId: 'domain-uuid',
 *   domain: 'example.com',
 *   scanType: 'quick'
 * });
 */
export function useCreateScan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ domainId, domain, scanType }: { domainId: string; domain: string; scanType: 'quick' | 'full' }) => {
      // Step 1: Create the scan record in the database with 'pending' status
      const { data, error } = await supabase
        .from('scans')
        .insert({
          user_id: user!.id,
          domain_id: domainId,
          domain,
          scan_type: scanType,
          status: 'pending',
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Step 2: Trigger the AI security scan edge function asynchronously
      // This runs in the background and updates the scan record when complete
      const scanData = data as Scan;
      supabase.functions.invoke('security-scan', {
        body: {
          scanId: scanData.id,
          domain,
          scanType,
        },
      }).catch(err => {
        // Log error but don't fail - scan status will show 'failed' in DB
        console.error('Error triggering security scan:', err);
      });
      
      return scanData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
    },
  });
}

// ============================================================================
// PHISHING HOOKS
// ============================================================================

/**
 * Fetches all phishing checks performed by the current user.
 * Results are ordered by check time, newest first.
 * 
 * @returns Query result containing array of PhishingCheck objects
 */
export function usePhishingChecks() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['phishing_checks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phishing_checks')
        .select('*')
        .order('checked_at', { ascending: false });
      
      if (error) throw error;
      return data as PhishingCheck[];
    },
    enabled: !!user,
  });
}

/**
 * Mutation hook for creating a new phishing check.
 * Automatically invalidates the phishing checks cache on success.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreatePhishingCheck() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (check: Omit<PhishingCheck, 'id' | 'user_id' | 'checked_at'>) => {
      const { data, error } = await supabase
        .from('phishing_checks')
        .insert({
          ...check,
          user_id: user!.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as PhishingCheck;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phishing_checks'] });
    },
  });
}

// ============================================================================
// SECURITY SCORES HOOKS
// ============================================================================

/**
 * Fetches historical security scores for trend analysis.
 * Returns the last 10 scores ordered chronologically (oldest first).
 * 
 * @returns Query result containing array of SecurityScore objects
 */
export function useSecurityScores() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['security_scores', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_scores')
        .select('*')
        .order('recorded_at', { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return data as SecurityScore[];
    },
    enabled: !!user,
  });
}

// ============================================================================
// PROFILE HOOKS
// ============================================================================

/**
 * Fetches the current user's profile information.
 * Profile includes business name and industry for benchmarking.
 * 
 * @returns Query result containing Profile object or null
 */
export function useProfile() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!user,
  });
}

/**
 * Mutation hook for updating the user's profile.
 * Automatically invalidates the profile cache on success.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user!.id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ============================================================================
// NOTIFICATION SETTINGS HOOKS
// ============================================================================

/**
 * Fetches the current user's notification preferences.
 * 
 * @returns Query result containing NotificationSettings object or null
 */
export function useNotificationSettings() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['notification_settings', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as NotificationSettings | null;
    },
    enabled: !!user,
  });
}

/**
 * Mutation hook for updating notification settings.
 * Automatically invalidates the notification settings cache on success.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (updates: Partial<NotificationSettings>) => {
      const { data, error } = await supabase
        .from('notification_settings')
        .update(updates)
        .eq('user_id', user!.id)
        .select()
        .single();
      
      if (error) throw error;
      return data as NotificationSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification_settings'] });
    },
  });
}

// ============================================================================
// SCAN SCHEDULES HOOKS
// ============================================================================

/**
 * Represents an automated scan schedule.
 * Allows users to set up recurring security scans.
 */
export interface ScanSchedule {
  /** Unique identifier for the schedule */
  id: string;
  /** ID of the user who owns this schedule */
  user_id: string;
  /** ID of the domain to scan */
  domain_id: string;
  /** Frequency of the automated scan */
  frequency: 'weekly' | 'monthly';
  /** Day of week for weekly scans (0=Sunday, 6=Saturday) */
  day_of_week: number | null;
  /** Day of month for monthly scans (1-31) */
  day_of_month: number | null;
  /** Type of scan to run */
  scan_type: 'quick' | 'full';
  /** Whether the schedule is currently active */
  is_active: boolean;
  /** Timestamp of the last scheduled run */
  last_run_at: string | null;
  /** Timestamp of the next scheduled run */
  next_run_at: string;
  /** Schedule creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Joined domain data (domain name) */
  domains?: { domain: string };
}

/**
 * Fetches all scan schedules for the current user.
 * Includes joined domain information for display.
 * 
 * @returns Query result containing array of ScanSchedule objects
 */
export function useScanSchedules() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['scan_schedules', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scan_schedules')
        .select('*, domains(domain)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ScanSchedule[];
    },
    enabled: !!user,
  });
}

/**
 * Mutation hook for creating a new scan schedule.
 * Automatically calculates the next run time based on frequency and day settings.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreateScanSchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (schedule: {
      domain_id: string;
      frequency: 'weekly' | 'monthly';
      day_of_week?: number;
      day_of_month?: number;
      scan_type: 'quick' | 'full';
    }) => {
      // Calculate the next run time based on the schedule configuration
      const nextRunAt = calculateNextRunTime(
        schedule.frequency,
        schedule.day_of_week ?? null,
        schedule.day_of_month ?? null
      );

      const { data, error } = await supabase
        .from('scan_schedules')
        .insert({
          user_id: user!.id,
          domain_id: schedule.domain_id,
          frequency: schedule.frequency,
          day_of_week: schedule.day_of_week ?? null,
          day_of_month: schedule.day_of_month ?? null,
          scan_type: schedule.scan_type,
          next_run_at: nextRunAt.toISOString(),
        })
        .select('*, domains(domain)')
        .single();
      
      if (error) throw error;
      return data as ScanSchedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan_schedules'] });
    },
  });
}

/**
 * Mutation hook for updating an existing scan schedule.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateScanSchedule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ScanSchedule> }) => {
      const { data, error } = await supabase
        .from('scan_schedules')
        .update(updates)
        .eq('id', id)
        .select('*, domains(domain)')
        .single();
      
      if (error) throw error;
      return data as ScanSchedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan_schedules'] });
    },
  });
}

/**
 * Mutation hook for deleting a scan schedule.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useDeleteScanSchedule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scan_schedules')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan_schedules'] });
    },
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculates the next scheduled run time based on frequency and day settings.
 * All scheduled runs are set to 9:00 AM.
 * 
 * @param frequency - 'weekly' or 'monthly'
 * @param dayOfWeek - Day of week for weekly (0=Sunday to 6=Saturday)
 * @param dayOfMonth - Day of month for monthly (1-31)
 * @returns Date object representing the next run time
 */
function calculateNextRunTime(
  frequency: 'weekly' | 'monthly',
  dayOfWeek: number | null,
  dayOfMonth: number | null
): Date {
  const now = new Date();
  const next = new Date(now);

  if (frequency === 'weekly' && dayOfWeek !== null) {
    // Calculate days until the target day of week
    const currentDay = now.getDay();
    let daysUntilNext = dayOfWeek - currentDay;
    if (daysUntilNext <= 0) {
      // If target day has passed this week, schedule for next week
      daysUntilNext += 7;
    }
    next.setDate(now.getDate() + daysUntilNext);
    next.setHours(9, 0, 0, 0); // Set to 9:00 AM
  } else if (frequency === 'monthly' && dayOfMonth !== null) {
    // Set to the target day of the current month
    next.setDate(dayOfMonth);
    next.setHours(9, 0, 0, 0);
    if (next <= now) {
      // If target day has passed this month, schedule for next month
      next.setMonth(next.getMonth() + 1);
    }
  } else {
    // Default: schedule for 7 days from now
    next.setDate(now.getDate() + 7);
    next.setHours(9, 0, 0, 0);
  }

  return next;
}
