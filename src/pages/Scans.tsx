import { useNavigate } from 'react-router-dom';
import { Plus, Shield, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { useScans, useDomains } from '@/hooks/useSecurityData';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const statusConfig = {
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-score-ok' },
  running: { icon: Loader2, label: 'Running', color: 'text-primary' },
  pending: { icon: Clock, label: 'Pending', color: 'text-muted-foreground' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-score-critical' },
};

export default function Scans() {
  const navigate = useNavigate();
  const { data: scans, isLoading: scansLoading } = useScans();
  const { data: domains, isLoading: domainsLoading } = useDomains();

  const isLoading = scansLoading || domainsLoading;

  if (isLoading) {
    return <LoadingState message="Loading scans..." />;
  }

  // Check if user has domains first
  if (!domains || domains.length === 0) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold font-display">Website Scans</h1>
            <p className="text-muted-foreground mt-1">Check your website for security vulnerabilities</p>
          </div>
        </div>
        <EmptyState
          icon={Shield}
          title="Add a domain first"
          description="Before you can run scans, you need to add at least one website domain to monitor."
          actionLabel="Add Domain"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  if (!scans || scans.length === 0) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold font-display">Website Scans</h1>
            <p className="text-muted-foreground mt-1">Check your website for security vulnerabilities</p>
          </div>
        </div>
        <EmptyState
          icon={Shield}
          title="No scans yet"
          description="Start by running your first scan to see how secure your website is."
          actionLabel="Run first scan"
          onAction={() => navigate('/scans/new')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Website Scans</h1>
          <p className="text-muted-foreground mt-1">Check your website for security vulnerabilities</p>
        </div>
        <Button onClick={() => navigate('/scans/new')}>
          <Plus className="w-4 h-4 mr-2" />
          Run New Scan
        </Button>
      </div>

      {/* Scan List */}
      <div className="space-y-3">
        {scans.map((scan) => {
          const status = statusConfig[scan.status];
          const StatusIcon = status.icon;
          
          return (
            <Card 
              key={scan.id} 
              variant="interactive"
              className="cursor-pointer"
              onClick={() => navigate(`/scans/${scan.id}`)}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Domain & Type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{scan.domain}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {scan.scan_type === 'quick' ? 'Quick' : 'Full'} Scan
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(scan.started_at), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <StatusIcon className={cn(
                      "w-4 h-4",
                      status.color,
                      scan.status === 'running' && "animate-spin"
                    )} />
                    <span className={cn("text-sm font-medium", status.color)}>
                      {status.label}
                    </span>
                  </div>

                  {/* Summary (if completed) */}
                  {scan.status === 'completed' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {scan.critical_count > 0 && (
                        <Badge variant="critical">{scan.critical_count} Critical</Badge>
                      )}
                      {scan.high_count > 0 && (
                        <Badge variant="high">{scan.high_count} High</Badge>
                      )}
                      {scan.medium_count > 0 && (
                        <Badge variant="medium">{scan.medium_count} Medium</Badge>
                      )}
                      {scan.low_count > 0 && (
                        <Badge variant="low">{scan.low_count} Low</Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
