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

const SCAN_TRIGGER_URL = import.meta.env.VITE_SCAN_TRIGGER_URL || '/api/scans/trigger';

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;

  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error ? error.message : null;
    const maybeDetails = 'details' in error ? error.details : null;
    const maybeHint = 'hint' in error ? error.hint : null;

    const parts = [maybeMessage, maybeDetails, maybeHint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  return fallback;
}

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
  /** Organization that owns this domain, if it is company-scoped */
  organization_id: string | null;
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
  status: 'queued' | 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
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
  started_at: string | null;
  /** Timestamp when the scan completed, null if still running */
  completed_at: string | null;
  /** Original target URL sent to the scanner, if available */
  target_url?: string | null;
  /** Detailed backend error for failed scans */
  scan_error?: string | null;
  /** Timestamp when the scan row was created */
  created_at?: string;
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
  /** Numeric phishing risk score (0-100) */
  risk_score: number | null;
  /** Company scope for shared phishing checks */
  organization_id: string | null;
  /** Analyzer/source used for this result */
  analysis_source: string | null;
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

export interface AnalyzePhishingPayload {
  type: 'email' | 'link';
  content: string;
  subject?: string;
  senderEmail?: string;
  organizationId?: string | null;
}

export interface AnalyzePhishingResult {
  id: string;
  organizationId: string | null;
  riskLevel: 'high' | 'medium' | 'low';
  riskScore: number;
  verdict: string;
  redFlags: Array<{
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  source: string;
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
  /** Origin of the score record if present */
  source?: string | null;
}

/**
 * Represents a user's business profile information.
 * Used for industry benchmarking and personalization.
 */
export interface Profile {
  /** User ID (matches auth.users) */
  id: string;
  /** User's display name */
  full_name: string | null;
  /** Name of the user's company */
  company_name: string | null;
  /** Industry category for benchmarking */
  industry: string | null;
  /** Profile creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

function normalizeProfileRow(row: Record<string, unknown> | null): Profile | null {
  if (!row) return null;

  const companyName =
    typeof row.company_name === 'string'
      ? row.company_name
      : typeof row.business_name === 'string'
        ? row.business_name
        : null;

  return {
    ...row,
    company_name: companyName,
  } as Profile;
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
        .eq('user_id', user!.id)
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
    mutationFn: async ({ domain, organizationId }: { domain: string; organizationId?: string | null }) => {
      const { data, error } = await supabase
        .from('domains')
        .insert({
          domain,
          user_id: user!.id,
          organization_id: organizationId ?? null,
          is_verified: true,
        })
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
 * Creates the scan record and triggers the OWASP ZAP-backed security-scan edge function.
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
      const { data: domainRecord, error: domainError } = await supabase
        .from('domains')
        .select('organization_id')
        .eq('id', domainId)
        .single();

      if (domainError) {
        throw new Error(toErrorMessage(domainError, 'Failed to load the selected domain'));
      }

      // Step 1: Create the scan record in the database with 'pending' status
      const { data, error } = await supabase
        .from('scans')
        .insert({
          user_id: user!.id,
          domain_id: domainId,
          domain,
          organization_id: domainRecord.organization_id ?? null,
          scan_type: scanType,
          source: 'website',
          status: 'pending',
        })
        .select()
        .single();
      
      if (error) {
        throw new Error(toErrorMessage(error, 'Failed to create the scan record'));
      }
      
      // Step 2: Trigger the Node backend scanner asynchronously so it can reach the private ZAP host.
      const scanData = data as Scan;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const triggerResponse = await fetch(SCAN_TRIGGER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          scanId: scanData.id,
          domain,
          scanType,
        }),
      });

      if (!triggerResponse.ok) {
        const payload = await triggerResponse.json().catch(() => null);
        const triggerMessage =
          payload?.error?.message ||
          payload?.error ||
          'Failed to trigger backend scan';

        await supabase
          .from('scans')
          .update({
            status: 'failed',
            scan_error: triggerMessage,
          })
          .eq('id', scanData.id);

        throw new Error(triggerMessage);
      }
      
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
export function usePhishingChecks(organizationId?: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['phishing_checks', user?.id, organizationId ?? 'personal'],
    queryFn: async () => {
      let query = supabase
        .from('phishing_checks')
        .select('*')
        .order('checked_at', { ascending: false });

      query = organizationId
        ? query.eq('organization_id', organizationId)
        : query.is('organization_id', null);

      const { data, error } = await query;
      
      if (error) throw error;
      return data as PhishingCheck[];
    },
    enabled: !!user,
  });
}

/**
 * Fetches all red flags associated with a specific phishing check.
 */
export function usePhishingRedFlags(checkId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['phishing_red_flags', checkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phishing_red_flags')
        .select('*')
        .eq('check_id', checkId)
        .order('severity', { ascending: true });

      if (error) throw error;
      return data as PhishingRedFlag[];
    },
    enabled: !!user && !!checkId,
  });
}

/**
 * Mutation hook for analyzing a phishing email or link.
 * Automatically invalidates the phishing checks cache on success.
 * 
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useAnalyzePhishing() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payload: AnalyzePhishingPayload) => {
      const { data, error } = await supabase.functions.invoke('analyze-phishing', {
        body: payload,
      });
      
      if (error) throw error;
      return data as AnalyzePhishingResult;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['phishing_checks'] });
      queryClient.invalidateQueries({
        queryKey: ['phishing_checks', undefined, variables.organizationId ?? 'personal'],
      });
      queryClient.invalidateQueries({ queryKey: ['activity_logs'] });
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
      return normalizeProfileRow(data as Record<string, unknown> | null);
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
      const profilePayload = {
        ...updates,
      };

      let { data, error } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', user!.id)
        .select()
        .maybeSingle();

      const profileErrorMessage = toErrorMessage(error, '');
      if (error && profileErrorMessage.includes('company_name')) {
        const { company_name, ...restPayload } = profilePayload as Record<string, unknown>;
        const legacyUpdatePayload = {
          ...restPayload,
          ...(typeof company_name === 'string' ? { business_name: company_name } : {}),
        };

        const legacyUpdateResult = await supabase
          .from('profiles')
          .update(legacyUpdatePayload as any)
          .eq('id', user!.id)
          .select('*')
          .maybeSingle();

        data = legacyUpdateResult.data;
        error = legacyUpdateResult.error;
      }

      if (!error && data) {
        return normalizeProfileRow(data as Record<string, unknown> | null) as Profile;
      }

      if (error) throw error;

      let insertPayload: Record<string, unknown> = {
        id: user!.id,
        ...profilePayload,
      };

      let insertResult = await supabase
        .from('profiles')
        .insert(insertPayload as any)
        .select()
        .single();

      const insertErrorMessage = toErrorMessage(insertResult.error, '');
      if (insertResult.error && insertErrorMessage.includes('company_name')) {
        const { company_name, ...restPayload } = insertPayload;
        insertPayload = {
          ...restPayload,
          ...(typeof company_name === 'string' ? { business_name: company_name } : {}),
        };

        insertResult = await supabase
          .from('profiles')
          .insert(insertPayload as any)
          .select('*')
          .single();
      }
      
      if (insertResult.error) throw insertResult.error;
      return normalizeProfileRow(insertResult.data as Record<string, unknown> | null) as Profile;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', user?.id], data);
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
        .maybeSingle();
      
      if (error) throw error;
      if (data) return data as NotificationSettings;

      const insertResult = await supabase
        .from('notification_settings')
        .insert({
          user_id: user!.id,
          ...updates,
        })
        .select()
        .single();

      if (insertResult.error) throw insertResult.error;
      return insertResult.data as NotificationSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['notification_settings', user?.id], data);
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
      const { data: domainRecord, error: domainError } = await supabase
        .from('domains')
        .select('organization_id')
        .eq('id', schedule.domain_id)
        .single();

      if (domainError) throw domainError;

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
          organization_id: domainRecord.organization_id ?? null,
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
