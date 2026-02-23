import { cn } from '@/lib/utils';
import type { SecurityScore as SecurityScoreType, ScoreTier } from '@/types';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface SecurityScoreProps {
  data: SecurityScoreType;
}

const tierConfig: Record<ScoreTier, { label: string; color: string; bgColor: string }> = {
  ok: { label: 'Looking Good', color: 'text-score-ok', bgColor: 'bg-score-ok' },
  'at-risk': { label: 'Needs Attention', color: 'text-score-at-risk', bgColor: 'bg-score-at-risk' },
  critical: { label: 'Critical Issues', color: 'text-score-critical', bgColor: 'bg-score-critical' },
};

export function SecurityScore({ data }: SecurityScoreProps) {
  const tier = tierConfig[data.tier];
  const change = data.current - data.previous;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (data.current / 100) * circumference;

  return (
    <div className="bg-card rounded-xl border shadow-card p-6 animate-slide-up">
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* Score Circle */}
        <div className="relative w-32 h-32 mx-auto md:mx-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              className={cn(tier.color, "animate-score-fill")}
              strokeDasharray={circumference}
              style={{ strokeDashoffset }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-4xl font-bold font-display", tier.color)}>
              {data.current}
            </span>
            <span className="text-xs text-muted-foreground">out of 100</span>
          </div>
        </div>

        {/* Score Details */}
        <div className="flex-1 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
            <div className={cn("w-3 h-3 rounded-full", tier.bgColor)} />
            <h2 className="text-xl font-semibold font-display">{tier.label}</h2>
          </div>
          
          <p className="text-muted-foreground text-sm mb-4">
            Your Security Health Score reflects how well your website is protected against common threats.
          </p>

          {/* Change indicator */}
          <div className="flex items-center justify-center md:justify-start gap-4 text-sm">
            <div className="flex items-center gap-1">
              {change > 0 ? (
                <TrendingUp className="w-4 h-4 text-score-ok" />
              ) : change < 0 ? (
                <TrendingDown className="w-4 h-4 text-score-critical" />
              ) : (
                <Minus className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={cn(
                "font-medium",
                change > 0 ? "text-score-ok" : change < 0 ? "text-score-critical" : "text-muted-foreground"
              )}>
                {change > 0 ? '+' : ''}{change} pts
              </span>
              <span className="text-muted-foreground">from last scan</span>
            </div>
          </div>

          {/* Scan dates */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Last scan: {format(new Date(data.lastScanDate), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Next scan: {format(new Date(data.nextScanDate), 'MMM d, yyyy')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
