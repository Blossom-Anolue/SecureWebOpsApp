import { useState } from 'react';
import { format } from 'date-fns';
import { 
  Activity, 
  Shield, 
  Globe, 
  Calendar, 
  Users, 
  UserPlus, 
  UserMinus, 
  Mail, 
  FileText, 
  Settings,
  Filter,
  Download,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useActivityLogs, type ActivityLog, type ActivityAction } from '@/hooks/useActivityLog';
import { useOrganizations } from '@/hooks/useOrganizations';

const ACTION_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  'scan.started': { icon: Shield, label: 'Scan Started', color: 'text-primary' },
  'scan.completed': { icon: Shield, label: 'Scan Completed', color: 'text-success' },
  'scan.failed': { icon: Shield, label: 'Scan Failed', color: 'text-destructive' },
  'domain.added': { icon: Globe, label: 'Domain Added', color: 'text-primary' },
  'domain.removed': { icon: Globe, label: 'Domain Removed', color: 'text-warning' },
  'schedule.created': { icon: Calendar, label: 'Schedule Created', color: 'text-primary' },
  'schedule.updated': { icon: Calendar, label: 'Schedule Updated', color: 'text-muted-foreground' },
  'schedule.deleted': { icon: Calendar, label: 'Schedule Deleted', color: 'text-warning' },
  'team.created': { icon: Users, label: 'Team Created', color: 'text-primary' },
  'team.updated': { icon: Users, label: 'Team Updated', color: 'text-muted-foreground' },
  'member.invited': { icon: UserPlus, label: 'Member Invited', color: 'text-primary' },
  'member.joined': { icon: UserPlus, label: 'Member Joined', color: 'text-success' },
  'member.removed': { icon: UserMinus, label: 'Member Removed', color: 'text-warning' },
  'member.role_changed': { icon: Users, label: 'Role Changed', color: 'text-muted-foreground' },
  'phishing.checked': { icon: Mail, label: 'Phishing Check', color: 'text-primary' },
  'report.downloaded': { icon: FileText, label: 'Report Downloaded', color: 'text-muted-foreground' },
  'settings.updated': { icon: Settings, label: 'Settings Updated', color: 'text-muted-foreground' },
};

export default function ActivityLogPage() {
  const { data: organizations } = useOrganizations();
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [filterAction, setFilterAction] = useState<string>('all');
  
  const { data: logs, isLoading } = useActivityLogs(selectedOrgId, 100);

  const filteredLogs = logs?.filter(log => 
    filterAction === 'all' || log.action === filterAction
  );

  const exportToCSV = () => {
    if (!filteredLogs?.length) return;

    const headers = ['Date', 'Time', 'Action', 'Resource Type', 'Details'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'yyyy-MM-dd'),
      format(new Date(log.created_at), 'HH:mm:ss'),
      ACTION_CONFIG[log.action]?.label || log.action,
      log.resource_type,
      JSON.stringify(log.details),
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <LoadingState message="Loading activity log..." />;
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Activity Log</h1>
          <p className="text-muted-foreground mt-1">Track all actions for compliance and auditing</p>
        </div>
        <Button variant="outline" onClick={exportToCSV} disabled={!filteredLogs?.length}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="scan.started">Scans Started</SelectItem>
                  <SelectItem value="scan.completed">Scans Completed</SelectItem>
                  <SelectItem value="domain.added">Domains Added</SelectItem>
                  <SelectItem value="member.invited">Members Invited</SelectItem>
                  <SelectItem value="member.role_changed">Role Changes</SelectItem>
                  <SelectItem value="settings.updated">Settings Updates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {organizations && organizations.length > 0 && (
              <Select 
                value={selectedOrgId || 'personal'} 
                onValueChange={(v) => setSelectedOrgId(v === 'personal' ? undefined : v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal Activity</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            {filteredLogs?.length || 0} activities recorded
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!filteredLogs || filteredLogs.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Activities will appear here as you use the app."
            />
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log, index) => {
                const config = ACTION_CONFIG[log.action] || { 
                  icon: Activity, 
                  label: log.action, 
                  color: 'text-muted-foreground' 
                };
                const Icon = config.icon;
                const isNewDay = index === 0 || 
                  format(new Date(log.created_at), 'yyyy-MM-dd') !== 
                  format(new Date(filteredLogs[index - 1].created_at), 'yyyy-MM-dd');

                return (
                  <div key={log.id}>
                    {isNewDay && (
                      <div className="sticky top-0 bg-background py-2 mt-4 first:mt-0">
                        <p className="text-xs font-medium text-muted-foreground">
                          {format(new Date(log.created_at), 'EEEE, MMMM d, yyyy')}
                        </p>
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{config.label}</span>
                          <Badge variant="secondary" className="text-xs">
                            {log.resource_type}
                          </Badge>
                        </div>
                        {Object.keys(log.details).length > 0 && (
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {formatDetails(log.details)}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), 'h:mm a')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDetails(details: Record<string, any>): string {
  const parts: string[] = [];
  
  if (details.domain) parts.push(`Domain: ${details.domain}`);
  if (details.score !== undefined) parts.push(`Score: ${details.score}`);
  if (details.email) parts.push(`Email: ${details.email}`);
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.name) parts.push(details.name);
  
  return parts.join(' • ') || JSON.stringify(details);
}
