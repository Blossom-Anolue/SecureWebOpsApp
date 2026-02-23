export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export type ScoreTier = 'ok' | 'at-risk' | 'critical';

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ScanType = 'quick' | 'full';

export interface SecurityIssue {
  id: string;
  title: string;
  severity: SeverityLevel;
  category: string;
  owaspCategory?: string;
  description: string;
  businessImpact: string;
  recommendation: string;
  technicalDetails?: string;
}

export interface Scan {
  id: string;
  domain: string;
  type: ScanType;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  score?: number;
  issues: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface PhishingCheck {
  id: string;
  type: 'email' | 'link';
  content: string;
  subject?: string;
  from?: string;
  checkedAt: string;
  riskLevel: 'high' | 'medium' | 'low';
  verdict: string;
  redFlags: RedFlag[];
}

export interface RedFlag {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SecurityScore {
  current: number;
  previous: number;
  tier: ScoreTier;
  lastScanDate: string;
  nextScanDate: string;
  trend: { date: string; score: number }[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

export interface TrainingLesson {
  id: string;
  title: string;
  description: string;
  duration: string;
  completed: boolean;
  category: string;
}

export interface PhishingSimulation {
  id: string;
  name: string;
  template: string;
  status: 'scheduled' | 'running' | 'completed';
  scheduledFor: string;
  recipients: number;
  clickRate?: number;
}
