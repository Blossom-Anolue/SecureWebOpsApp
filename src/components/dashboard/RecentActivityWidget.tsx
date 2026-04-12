import { format } from 'date-fns';
import { Activity, Shield, Globe, Calendar, Users, UserPlus, UserMinus, Mail, FileText, Settings, Lock, Unlock, Share2, Trash2, ShieldAlert, FileUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useActivityLogs } from '@/hooks/useActivityLog';

const ACTION_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string; iconBg: string; border?: string }> = {
  'scan.started': { icon: Shield, label: 'Scan Started', color: 'text-primary', iconBg: 'bg-primary/10', border: 'border-primary' },
  'phishing.checked': { icon: Mail, label: 'Phishing Check', color: 'text-primary', iconBg: 'bg-primary/10', border: 'border-primary' },
  'domain.added': { icon: Globe, label: 'Domain Added', color: 'text-blue-500', iconBg: 'bg-blue-500/10', border: 'border-blue-500' },
  'schedule.created': { icon: Calendar, label: 'Schedule Created', color: 'text-violet-500', iconBg: 'bg-violet-500/10', border: 'border-violet-500' },
  'team.created': { icon: Users, label: 'Team Created', color: 'text-indigo-500', iconBg: 'bg-indigo-500/10', border: 'border-indigo-500' },
  'member.invited': { icon: UserPlus, label: 'Member Invited', color: 'text-indigo-500', iconBg: 'bg-indigo-500/10', border: 'border-indigo-500' },
  'FILE_DECRYPT_SUCCESS': { icon: Unlock, label: 'File Decrypted', color: 'text-sky-500', iconBg: 'bg-sky-500/10', border: 'border-sky-500' },
  'ACCESS_GRANTED': { icon: Share2, label: 'Vault Access Granted', color: 'text-sky-500', iconBg: 'bg-sky-500/10', border: 'border-sky-500' },
  'scan.completed': { icon: Shield, label: 'Scan Completed', color: 'text-severity-low', iconBg: 'bg-severity-low-bg', border: 'border-severity-low' },
  'member.joined': { icon: UserPlus, label: 'Member Joined', color: 'text-severity-low', iconBg: 'bg-severity-low-bg', border: 'border-severity-low' },
  'FILE_ENCRYPTED_STORED': { icon: Lock, label: 'File Encrypted', color: 'text-severity-low', iconBg: 'bg-severity-low-bg', border: 'border-severity-low' },
  'scan.failed': { icon: Shield, label: 'Scan Failed', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'FILE_DECRYPT_FAILURE': { icon: ShieldAlert, label: 'Decryption Failed', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'UNAUTHORIZED_ACCESS': { icon: ShieldAlert, label: 'Access Blocked', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'UNAUTHORIZED_ACCESS_ATTEMPT': { icon: ShieldAlert, label: 'Access Blocked', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'domain.removed': { icon: Globe, label: 'Domain Removed', color: 'text-severity-high', iconBg: 'bg-severity-high-bg', border: 'border-severity-high' },
  'member.removed': { icon: UserMinus, label: 'Member Removed', color: 'text-severity-high', iconBg: 'bg-severity-high-bg', border: 'border-severity-high' },
  'FILE_PURGED': { icon: Trash2, label: 'File Purged', color: 'text-severity-high', iconBg: 'bg-severity-high-bg', border: 'border-severity-high' },
  'schedule.updated': { icon: Calendar, label: 'Schedule Updated', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'team.updated': { icon: Users, label: 'Team Updated', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'member.role_changed': { icon: Users, label: 'Role Changed', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'report.downloaded': { icon: FileText, label: 'Report Downloaded', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'settings.updated': { icon: Settings, label: 'Settings Updated', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'UPLOAD_ATTEMPT': { icon: FileUp, label: 'Vault Upload Attempt', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
};

function formatDetails(details: Record<string, any>): string {
  const parts: string[] = [];
  if (details.domain) parts.push(`Domain: ${details.domain}`);
  if (details.score !== undefined) parts.push(`Score: ${details.score}`);
  if (details.email) parts.push(`Email: ${details.email}`);
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.name) parts.push(details.name);
  if (details.fileName) parts.push(`File: ${details.fileName}`);
  if (details.details) parts.push(details.details);
  return parts.join(' • ') || JSON.stringify(details);
}

export function RecentActivityWidget() {
  const { data: logs, isLoading } = useActivityLogs(undefined, 5);
  const navigate = useNavigate();

  if (isLoading || !logs || logs.length === 0) return null;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>Your latest security actions</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/activity')} className="text-primary">
          View All
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-3">
          {logs.map((log) => {
            const config = ACTION_CONFIG[log.action] || { 
              icon: Activity, 
              label: log.action, 
              color: 'text-muted-foreground',
              iconBg: 'bg-muted',
              border: 'border-muted'
            };
            const Icon = config.icon;

            return (
              <div key={log.id} className={`flex items-start gap-3 p-3 rounded-lg bg-card border-l-4 ${config.border || 'border-muted'} shadow-sm hover:shadow-md transition-all`}>
                <div className={`p-2 rounded-full ${config.iconBg} ${config.color} shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{config.label}</span>
                    {log.resource_type && (
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {log.resource_type}
                      </Badge>
                    )}
                  </div>
                  {Object.keys(log.details).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {formatDetails(log.details)}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium tracking-wide">
                    {format(new Date(log.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}