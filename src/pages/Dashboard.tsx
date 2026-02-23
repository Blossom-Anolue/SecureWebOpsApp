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

import { useNavigate } from 'react-router-dom';
import { Shield, Mail, Plus } from 'lucide-react';
import { SecurityScore } from '@/components/dashboard/SecurityScore';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { RecommendationCard } from '@/components/dashboard/RecommendationCard';
import { SecurityTrends } from '@/components/dashboard/SecurityTrends';
import { IndustryBenchmark } from '@/components/dashboard/IndustryBenchmark';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { useScans, usePhishingChecks, useSecurityScores, useDomains, useProfile } from '@/hooks/useSecurityData';
import { mockRecommendations } from '@/lib/mock-data';
import type { SecurityScore as SecurityScoreType } from '@/types';

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
  
  // Fetch all required data in parallel
  const { data: scans, isLoading: scansLoading } = useScans();
  const { data: phishingChecks, isLoading: phishingLoading } = usePhishingChecks();
  const { data: securityScores, isLoading: scoresLoading } = useSecurityScores();
  const { data: domains, isLoading: domainsLoading } = useDomains();
  const { data: profile } = useProfile();

  // Combine loading states
  const isLoading = scansLoading || phishingLoading || scoresLoading || domainsLoading;

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
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Security Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your business security at a glance</p>
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

  // Calculate current security score
  // Priority: latest recorded score > latest scan score > 0
  const latestScore = securityScores?.[securityScores.length - 1]?.score ?? latestScan?.score ?? 0;
  const previousScore = securityScores?.[securityScores.length - 2]?.score ?? 0;
  
  // Determine security tier based on score
  // - 80+: OK (green)
  // - 50-79: At Risk (yellow)
  // - <50: Critical (red)
  const tier = latestScore >= 80 ? 'ok' : latestScore >= 50 ? 'at-risk' : 'critical';
  
  // Prepare data object for SecurityScore component
  const securityData: SecurityScoreType = {
    current: latestScore,
    previous: previousScore,
    tier,
    lastScanDate: latestScan?.completed_at || new Date().toISOString(),
    nextScanDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    trend: securityScores?.map(s => ({ date: s.recorded_at, score: s.score })) || [],
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-display">Security Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your business security at a glance</p>
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
      <div className="grid md:grid-cols-2 gap-4">
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
            onClick: () => navigate(latestScan ? `/scans/${latestScan.id}` : '/scans/new') 
          }}
          secondaryAction={latestScan ? { label: 'Run Scan', onClick: () => navigate('/scans/new') } : undefined}
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
      </div>

      {/* ================================================================== */}
      {/* RECOMMENDATIONS & TRENDS - Action items and history */}
      {/* ================================================================== */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top recommendations to improve security */}
        <RecommendationCard recommendations={mockRecommendations} />
        
        {/* Security score trend chart or placeholder */}
        {securityData.trend.length > 0 ? (
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
