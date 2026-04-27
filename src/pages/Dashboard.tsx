/**
 * @fileoverview Security Dashboard Page
 * 
 * The main dashboard is the primary interface for users after logging in.
 * It provides an at-a-glance view of their security posture and answers
 * the key question: "Is my business protected?"
 * 
 * Components displayed:
 * - Security Score: 0-100 score with color-coded tiers
 * - Status Cards: Quick links to website security and phishing
 * - Recommendations: Top 3 actionable items
 * - Security Trends: Score history chart
 * - Industry Benchmark: Compare against industry averages
 * 
 * The dashboard adapts based on user state:
 * - No domains: Shows setup prompt
 * - No scans: Shows prompt to run first scan
 * - Has data: Shows full dashboard
 * 
 * @module pages/Dashboard
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Mail, Puzzle, Download, ExternalLink, Lock, FileUp, Settings as SettingsIcon, Globe, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { SecurityScore } from '@/components/dashboard/SecurityScore';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { SecurityTrends } from '@/components/dashboard/SecurityTrends';
import { IndustryBenchmark } from '@/components/dashboard/IndustryBenchmark';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { useScans, usePhishingChecks, useSecurityScores, useDomains, useProfile, useScanSchedules } from '@/hooks/useSecurityData';
import type { SecurityScore as SecurityScoreType } from '@/types';
import Greeting from '@/components/Greeting';

/**
 * Dashboard page component.
 * 
 * Fetches and displays security data for the current user.
 * Handles loading states and empty states appropriately.
 * 
 * @returns The rendered dashboard page
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const extensionDownloadUrl = '/downloads/securewebops-extension.zip';
  
  // Fetch all required data in parallel
  const { data: scans, isLoading: scansLoading } = useScans();
  const { data: phishingChecks, isLoading: phishingLoading } = usePhishingChecks();
  const { data: securityScores, isLoading: scoresLoading } = useSecurityScores();
  const { data: domains, isLoading: domainsLoading } = useDomains();
  const { data: profile } = useProfile();
  const { data: scanSchedules, isLoading: schedulesLoading } = useScanSchedules();

  // Vault stats
  const [vaultFileCount, setVaultFileCount] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) return;

    const fetchVaultData = async () => {
      const [ownedResult, sharedResult] = await Promise.all([
        supabase
          .from('encrypted_pdfs' as any)
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('file_permissions' as any)
          .select('file_id')
          .eq('user_id', user.id),
      ]);

      if (ownedResult.error) {
        console.error('Failed to load owned vault files:', ownedResult.error);
      }

      if (sharedResult.error) {
        console.error('Failed to load shared vault files:', sharedResult.error);
      }

      const fileIds = new Set<string>();

      for (const file of (ownedResult.data as any[]) || []) {
        if (file?.id) fileIds.add(file.id);
      }

      for (const permission of (sharedResult.data as any[]) || []) {
        if (permission?.file_id) fileIds.add(permission.file_id);
      }

      setVaultFileCount(fileIds.size);
    };

    void fetchVaultData();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('vault_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encrypted_pdfs', filter: `user_id=eq.${user.id}` },
        () => {
          void fetchVaultData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'file_permissions', filter: `user_id=eq.${user.id}` },
        () => {
          void fetchVaultData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user?.id]);

  // Combine loading states
  const isLoading = scansLoading || phishingLoading || scoresLoading || domainsLoading || schedulesLoading;

  // Show loading state while data is being fetched
  if (isLoading) {
    return <LoadingState message="Loading your security dashboard..." />;
  }

  // ============================================================================
  // EMPTY STATE: No domains configured
  // First-time users need to add a domain before they can use the app
  // ============================================================================
  if (!domains || domains.length === 0) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="space-y-1">
          <Greeting />
        </div>
        
        <EmptyState
          icon={Shield}
          title="Welcome to SecureWebOps!"
          description="Get started by adding your first website domain to monitor for security vulnerabilities."
          actionLabel="Add Your Website"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  // ============================================================================
  // DATA PROCESSING
  // Calculate metrics and prepare data for display
  // ============================================================================
  
  // Filter to only completed scans for stats
  const completedScans = scans?.filter(s => s.status === 'completed') || [];
  // Get the most recent completed scan
  const latestScan = completedScans[0];
  // Count high-risk phishing attempts (for warning display)
  const recentHighRiskPhishing = phishingChecks?.filter(p => p.risk_level === 'high').length || 0;

  // Build trend data from securityScores, fallback to completedScans if security_scores table is empty
  let trendData = securityScores?.map(s => ({ date: s.recorded_at, score: s.score, id: (s as any).scan_id })) || [];
  if (trendData.length === 0 && completedScans.length > 0) {
    trendData = [...completedScans]
      .filter(s => s.score !== null)
      .sort((a, b) => new Date(a.started_at || a.created_at || 0).getTime() - new Date(b.started_at || b.created_at || 0).getTime())
      .map(s => ({
        date: s.completed_at || s.started_at || s.created_at || new Date().toISOString(),
        score: s.score!,
        id: s.id
      }));
  }

  // Calculate current security score
  // Priority: latest recorded score > latest scan score > 0
  const latestScore = trendData.length > 0 ? trendData[trendData.length - 1].score : (latestScan?.score ?? 0);
  const previousScore = trendData.length > 1 ? trendData[trendData.length - 2].score : 0;
  
  // Determine security tier based on score
  // - 80+: OK (green)
  // - 50-79: At Risk (yellow)
  // - <50: Critical (red)
  const tier = latestScore >= 80 ? 'ok' : latestScore >= 50 ? 'at-risk' : 'critical';
  
  // Find the earliest next_run_at from active schedules
  const nextScanSchedule = scanSchedules
    ?.filter(s => s.is_active && s.next_run_at)
    .sort((a, b) => new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime())[0];

  // Prepare data object for SecurityScore component
  const securityData: SecurityScoreType = {
    current: latestScore,
    previous: previousScore,
    tier,
    lastScanDate: latestScan?.completed_at || new Date().toISOString(),
    nextScanDate: nextScanSchedule?.next_run_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // next scheduled or 7 days from now
    trend: trendData as any,
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Page Header */}
      <div className="space-y-1">
        <Greeting />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">What To Do Next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Move through setup in the same order you will use the product: confirm your business profile, monitor your domains, then protect important files.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate('/settings')}>
                <SettingsIcon className="w-4 h-4 mr-2" />
                Review Settings
              </Button>
              <Button variant="outline" onClick={() => navigate('/scans/new')}>
                <Globe className="w-4 h-4 mr-2" />
                Run Website Scan
              </Button>
              <Button variant="outline" onClick={() => navigate('/encrypt')}>
                <FileUp className="w-4 h-4 mr-2" />
                Encrypt A File
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 p-4 relative overflow-hidden transition-all hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800">
              <div className="absolute -right-4 -top-4 opacity-10 pointer-events-none">
                <Globe className="w-24 h-24 text-blue-600" />
              </div>
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <Globe className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">Monitored Domains</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 relative z-10">{domains.length}</p>
            </div>
            <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 p-4 relative overflow-hidden transition-all hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800">
              <div className="absolute -right-4 -top-4 opacity-10 pointer-events-none">
                <ShieldCheck className="w-24 h-24 text-emerald-600" />
              </div>
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Completed Scans</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 relative z-10">{completedScans.length}</p>
            </div>
            <div className="rounded-xl border bg-purple-50/50 dark:bg-purple-950/20 p-4 relative overflow-hidden transition-all hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800">
              <div className="absolute -right-4 -top-4 opacity-10 pointer-events-none">
                <Lock className="w-24 h-24 text-purple-600" />
              </div>
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <Lock className="w-4 h-4 text-purple-600" />
                <p className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">Secured Files</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 relative z-10">{vaultFileCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-gradient-to-r from-slate-900 to-slate-800 shadow-card p-6 md:p-8 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-primary/20 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none"></div>
        <div className="flex items-start gap-5 relative z-10">
          <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary-foreground backdrop-blur-sm border border-primary/30">
            <Puzzle className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white">Install The Browser Extension</h2>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Add the SecureWebOps Scanner extension to test quick website scans and Gmail or Outlook phishing checks.
              </p>
            </div>
            <div className="rounded-lg bg-slate-950/50 border border-slate-700 p-4 text-sm text-slate-300 font-mono">
              <p className="text-cyan-400 font-sans font-bold mb-2 text-xs uppercase tracking-wider flex items-center gap-2">
                <SettingsIcon className="w-3 h-3" /> Installation Guide:
              </p>
              <p>1. Download the zip below and extract it.</p>
              <p>2. Open `chrome://extensions` or `edge://extensions`.</p>
              <p>3. Turn on Developer mode and choose Load unpacked.</p>
              <p>4. Select the extracted `extension` folder, then sign in from the popup.</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={extensionDownloadUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition-all shadow-lg hover:shadow-cyan-500/25"
              >
                <Download className="h-4 w-4" strokeWidth={2.5} />
                Download Extension
              </a>
              <button
                onClick={() => navigate('/phishing/check')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-slate-700 hover:border-slate-500"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
                Test Phishing Page
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* SECURITY SCORE - The main "Are we safe?" indicator */}
      {/* ================================================================== */}
      {completedScans.length > 0 ? (
        <SecurityScore data={securityData} />
      ) : (
        // No scans yet - prompt user to run first scan
        <div className="bg-card rounded-xl border shadow-card p-6 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg">No scans yet</h3>
          <p className="text-muted-foreground mt-1 mb-4">Run your first scan to see your Security Health Score</p>
          <button 
            onClick={() => navigate('/scans/new')}
            className="text-primary hover:underline"
          >
            Run your first scan →
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* STATUS CARDS - Quick access to key areas */}
      {/* ================================================================== */}
      <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4">
        {/* Website Security Card */}
        <StatusCard
          icon={Shield}
          title="Website Security"
          summary={latestScan 
            ? `${latestScan.critical_count} Critical, ${latestScan.high_count} High issues`
            : 'No scans completed yet'
          }
          summaryColor={latestScan?.critical_count ? 'danger' : latestScan?.high_count ? 'warning' : 'success'}
          primaryAction={{ 
            label: latestScan ? 'View Issues' : 'Run Scan', 
            onClick: () => {
              navigate(latestScan ? `/scans/${latestScan.id}` : '/scans/new');
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
              }, 50);
            }
          }}
          secondaryAction={latestScan ? { 
            label: 'Run Scan', 
            onClick: () => {
              navigate('/scans/new');
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
              }, 50);
            }
          } : undefined}
        />
        
        {/* Phishing & Email Card */}
        <StatusCard
          icon={Mail}
          title="Phishing & Email"
          summary={recentHighRiskPhishing > 0 
            ? `${recentHighRiskPhishing} high-risk ${recentHighRiskPhishing === 1 ? 'email' : 'emails'} detected`
            : 'No high-risk emails detected'
          }
          summaryColor={recentHighRiskPhishing > 0 ? 'warning' : 'success'}
          primaryAction={{ label: 'Check Email', onClick: () => navigate('/phishing/check') }}
          secondaryAction={{ label: 'View History', onClick: () => navigate('/phishing/history') }}
        />

        {/* Protected Files Card */}
        <StatusCard
          icon={Lock}
          title="Secure File Vault"
          summary={`${vaultFileCount} protected file${vaultFileCount !== 1 ? 's' : ''}`}
          summaryColor={vaultFileCount > 0 ? 'success' : 'warning'}
          primaryAction={{ label: 'Encrypt New', onClick: () => navigate('/encrypt') }}
          secondaryAction={{ label: 'My Files', onClick: () => navigate('/vault') }}
        />
      </div>

      {/* ================================================================== */}
      {/* TRENDS - Security score history */}
      {/* ================================================================== */}
      <div className="grid gap-4">
        {/* Security score trend chart or placeholder */}
        {securityData.trend.length > 1 ? (
          <SecurityTrends data={securityData.trend} />
        ) : (
          <div className="bg-card rounded-xl border shadow-card p-6 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Score trend will appear after multiple scans</p>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* INDUSTRY BENCHMARK - Compare against peers */}
      {/* ================================================================== */}
      {completedScans.length > 0 && (
        <IndustryBenchmark 
          userScore={latestScore} 
          industry={profile?.industry || 'Other'} 
        />
      )}
    </div>
  );
}
