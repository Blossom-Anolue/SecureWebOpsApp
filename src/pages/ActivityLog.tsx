import { useEffect, useMemo, useState } from 'react';
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
  Loader2,
  Lock,
  Unlock,
  Share2,
  Trash2,
  ShieldAlert,
  FileUp,
  X,
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useActivityLogs, type ActivityLog, type ActivityAction } from '@/hooks/useActivityLog';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const ACTION_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string; iconBg: string; border?: string }> = {
  // Security & Core (Primary)
  'scan.started': { icon: Shield, label: 'Scan Started', color: 'text-primary', iconBg: 'bg-primary/10', border: 'border-primary' },
  'phishing.checked': { icon: Mail, label: 'Phishing Check', color: 'text-primary', iconBg: 'bg-primary/10', border: 'border-primary' },
  
  // Infrastructure & Domains (Blue)
  'domain.added': { icon: Globe, label: 'Domain Added', color: 'text-blue-500', iconBg: 'bg-blue-500/10', border: 'border-blue-500' },
  
  // Scheduling & Automation (Violet)
  'schedule.created': { icon: Calendar, label: 'Schedule Created', color: 'text-violet-500', iconBg: 'bg-violet-500/10', border: 'border-violet-500' },
  
  // Teams & Collaboration (Indigo)
  'team.created': { icon: Users, label: 'Team Created', color: 'text-indigo-500', iconBg: 'bg-indigo-500/10', border: 'border-indigo-500' },
  'member.invited': { icon: UserPlus, label: 'Member Invited', color: 'text-indigo-500', iconBg: 'bg-indigo-500/10', border: 'border-indigo-500' },
  
  // File Vault Access (Sky)
  'FILE_DECRYPT_SUCCESS': { icon: Unlock, label: 'File Decrypted', color: 'text-sky-500', iconBg: 'bg-sky-500/10', border: 'border-sky-500' },
  'ACCESS_GRANTED': { icon: Share2, label: 'Vault Access Granted', color: 'text-sky-500', iconBg: 'bg-sky-500/10', border: 'border-sky-500' },
  'FILE_DOWNLOAD_RAW': { icon: Lock, label: 'Raw File Downloaded', color: 'text-slate-500', iconBg: 'bg-slate-500/10', border: 'border-slate-500' },

  // Success (Severity Low / Green)
  'scan.completed': { icon: Shield, label: 'Scan Completed', color: 'text-severity-low', iconBg: 'bg-severity-low-bg', border: 'border-severity-low' },
  'member.joined': { icon: UserPlus, label: 'Member Joined', color: 'text-severity-low', iconBg: 'bg-severity-low-bg', border: 'border-severity-low' },
  'FILE_ENCRYPTED_STORED': { icon: Lock, label: 'File Encrypted', color: 'text-severity-low', iconBg: 'bg-severity-low-bg', border: 'border-severity-low' },

  // Error & Destructive (Destructive / Red)
  'scan.failed': { icon: Shield, label: 'Scan Failed', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'FILE_DECRYPT_FAILURE': { icon: ShieldAlert, label: 'Decryption Failed', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'FILE_DOWNLOAD_RAW_FAILURE': { icon: ShieldAlert, label: 'Raw Download Failed', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'UNAUTHORIZED_ACCESS': { icon: ShieldAlert, label: 'Access Blocked', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },
  'UNAUTHORIZED_ACCESS_ATTEMPT': { icon: ShieldAlert, label: 'Access Blocked', color: 'text-destructive', iconBg: 'bg-destructive/10', border: 'border-destructive' },

  // Warning (Severity High / Orange)
  'domain.removed': { icon: Globe, label: 'Domain Removed', color: 'text-severity-high', iconBg: 'bg-severity-high-bg', border: 'border-severity-high' },
  'member.removed': { icon: UserMinus, label: 'Member Removed', color: 'text-severity-high', iconBg: 'bg-severity-high-bg', border: 'border-severity-high' },
  'FILE_PURGED': { icon: Trash2, label: 'File Purged', color: 'text-severity-high', iconBg: 'bg-severity-high-bg', border: 'border-severity-high' },

  // Muted / Routine Updates (Muted)
  'schedule.updated': { icon: Calendar, label: 'Schedule Updated', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'team.updated': { icon: Users, label: 'Team Updated', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'member.role_changed': { icon: Users, label: 'Role Changed', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'report.downloaded': { icon: FileText, label: 'Report Downloaded', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'settings.updated': { icon: Settings, label: 'Settings Updated', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
  'UPLOAD_ATTEMPT': { icon: FileUp, label: 'Vault Upload Attempt', color: 'text-muted-foreground', iconBg: 'bg-muted', border: 'border-muted' },
};

// Safe date formatter to prevent React crashing on invalid timestamps
function safeFormat(dateStr: any, formatStr: string, fallback = 'Unknown Date'): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return fallback;
  return format(d, formatStr);
}

export default function ActivityLogPage() {
  const { data: organizations } = useOrganizations();
  const { user } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenLogIds, setHiddenLogIds] = useState<Set<string>>(new Set());
  const [decryptLog, setDecryptLog] = useState<{id: string, fileId: string, fileName: string} | null>(null);
  const [decryptEmail, setDecryptEmail] = useState('');
  const { toast } = useToast();
  
  const { data: logs, isLoading } = useActivityLogs(selectedOrgId, 100);

  const hiddenStorageKey = useMemo(() => {
    return user?.id ? `securewebops.activity.hidden.${user.id}` : null;
  }, [user?.id]);

  useEffect(() => {
    if (!hiddenStorageKey) {
      setHiddenLogIds(new Set());
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(hiddenStorageKey);
      if (!rawValue) {
        setHiddenLogIds(new Set());
        return;
      }

      const parsed = JSON.parse(rawValue);
      setHiddenLogIds(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setHiddenLogIds(new Set());
    }
  }, [hiddenStorageKey]);

  const persistHiddenLogIds = (nextIds: Set<string>) => {
    setHiddenLogIds(nextIds);

    if (!hiddenStorageKey) return;

    try {
      window.localStorage.setItem(hiddenStorageKey, JSON.stringify(Array.from(nextIds)));
    } catch {
      // Ignore storage write failures and keep the local in-memory view state.
    }
  };

  const filteredLogs = logs?.filter(log => {
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (hiddenLogIds.has(log.id)) return false;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const actionStr = String(log.action || '');
      const label = (ACTION_CONFIG[actionStr]?.label || actionStr).toLowerCase();
      const resource = String(log.resource_type || '').toLowerCase();
      const details = formatDetails(log.details).toLowerCase();
      
      if (!label.includes(query) && !resource.includes(query) && !details.includes(query)) return false;
    }
    
    return true;
  });

  const handleClearAll = async () => {
    if (!filteredLogs?.length) return;
    if (!confirm('Are you sure you want to clear the currently visible activity logs from your page?')) return;

    setActionLoading('clear-all');
    try {
      const nextIds = new Set(hiddenLogIds);
      for (const log of filteredLogs) {
        nextIds.add(log.id);
      }
      persistHiddenLogIds(nextIds);
      toast({ title: 'Success', description: 'Activity logs cleared from your page.', className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to clear activity logs.', variant: 'destructive', className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearSingle = async (id: string) => {
    setActionLoading(`clear-${id}`);
    try {
      const nextIds = new Set(hiddenLogIds);
      nextIds.add(id);
      persistHiddenLogIds(nextIds);
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to clear activity log.', variant: 'destructive', className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } finally {
      setActionLoading(null);
    }
  };

  const exportToCSV = () => {
    if (!filteredLogs?.length) return;

    const headers = ['Date', 'Time', 'Action', 'Resource Type', 'Details'];
    const rows = filteredLogs.map(log => {
      const actionStr = String(log.action || '');
      return [
        safeFormat(log.created_at, 'yyyy-MM-dd', ''),
        safeFormat(log.created_at, 'HH:mm:ss', ''),
        ACTION_CONFIG[actionStr]?.label || actionStr,
        log.resource_type || '',
        JSON.stringify(log.details || {}),
      ];
    });

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
    <div className="space-y-6 p-4 lg:p-8 max-w-6xl mx-auto pb-20 lg:pb-8 animate-in fade-in duration-500">
      {/* Enhanced Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-800 p-6 md:p-8 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
        <div className="absolute -right-6 -bottom-6 opacity-5 pointer-events-none">
          <Activity className="w-48 h-48 text-slate-900 dark:text-white" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Activity Log</h1>
          <div className="mt-2 space-y-2">
            <p className="text-muted-foreground text-lg">Track all actions for compliance and auditing</p>
            {organizations && organizations.length > 0 ? (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 inline-block px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                ✓ Enterprise Retention Active: 1-7 Years (SOC2/HIPAA)
              </p>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted inline-block px-2 py-0.5 rounded border">
                Personal Retention: 30 Days (Upgrade for 7-year compliance)
              </p>
            )}
          </div>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleClearAll} disabled={!filteredLogs?.length || actionLoading === 'clear-all'}>
            <Trash2 className="w-4 h-4 mr-2" />
            {actionLoading === 'clear-all' ? 'Clearing...' : 'Clear All'}
          </Button>
          <Button variant="outline" onClick={exportToCSV} disabled={!filteredLogs?.length}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search activity..." 
                className="pl-9 bg-white w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="scan.started">Scans Started</SelectItem>
                  <SelectItem value="scan.completed">Scans Completed</SelectItem>
                  <SelectItem value="domain.added">Domains Added</SelectItem>
                  <SelectItem value="member.invited">Members Invited</SelectItem>
                  <SelectItem value="member.role_changed">Role Changes</SelectItem>
                  <SelectItem value="phishing.checked">Phishing Checks</SelectItem>
                  <SelectItem value="settings.updated">Settings Updates</SelectItem>
                  <SelectItem value="FILE_ENCRYPTED_STORED">Vault Encryptions</SelectItem>
                  <SelectItem value="FILE_DECRYPT_SUCCESS">Vault Decryptions</SelectItem>
                  <SelectItem value="FILE_DOWNLOAD_RAW">Raw File Downloads</SelectItem>
                  <SelectItem value="ACCESS_GRANTED">Access Granted</SelectItem>
                  <SelectItem value="FILE_PURGED">Files Purged</SelectItem>
                  <SelectItem value="UNAUTHORIZED_ACCESS_ATTEMPT">Security Blocks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {organizations && organizations.length > 0 && (
              <Select 
                value={selectedOrgId || 'personal'} 
                onValueChange={(v) => setSelectedOrgId(v === 'personal' ? undefined : v)}
              >
                <SelectTrigger className="w-full sm:w-[200px] shrink-0">
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
                const actionStr = String(log.action || '');
                const config = ACTION_CONFIG[actionStr] || { 
                  icon: Activity, 
                  label: actionStr, 
                  color: 'text-muted-foreground',
                  iconBg: 'bg-muted',
                  border: 'border-muted'
                };
                const Icon = config.icon;
                const isNewDay = index === 0 || 
                  safeFormat(log.created_at, 'yyyy-MM-dd') !== 
                  safeFormat(filteredLogs[index - 1].created_at, 'yyyy-MM-dd');

                let parsedDetails = log.details;
                if (typeof parsedDetails === 'string') {
                  try { parsedDetails = JSON.parse(parsedDetails); } catch (e) {}
                }
                const hasDetails = parsedDetails && (typeof parsedDetails === 'object' ? Object.keys(parsedDetails).length > 0 : String(parsedDetails).trim().length > 0);
                const fileId = parsedDetails?.fileId;
                const fileName = parsedDetails?.fileName || 'document';

                return (
                  <div key={log.id}>
                    {isNewDay && (
                      <div className="sticky top-0 bg-background py-2 mt-4 first:mt-0 z-10">
                        <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
                          {safeFormat(log.created_at, 'EEEE, MMMM d, yyyy')}
                        </p>
                      </div>
                    )}
                    <div className={`group flex items-start gap-3 p-4 rounded-lg bg-card border-l-4 ${config.border || 'border-muted'} shadow-sm hover:shadow-md transition-all mb-2 relative`}>
                      <div className={`p-2 rounded-full ${config.iconBg} ${config.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 pr-8">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{config.label}</span>
                          {log.resource_type && (
                            <Badge variant="secondary" className="text-xs">
                              {log.resource_type}
                            </Badge>
                          )}
                        </div>
                        {hasDetails && (
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {formatDetails(log.details)}
                          </p>
                        )}
                        {actionStr === 'FILE_ENCRYPTED_STORED' && fileId && (
                           <Button
                             variant="outline"
                             size="sm"
                             className="mt-2 h-8 text-xs"
                             onClick={() => setDecryptLog({
                               id: log.id, 
                               fileId: fileId, 
                               fileName: fileName
                             })}
                             disabled={actionLoading === `download-${log.id}`}
                           >
                             {actionLoading === `download-${log.id}` ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Download className="w-3 h-3 mr-2" />}
                             Decrypt & Download
                           </Button>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" 
                          onClick={() => handleClearSingle(log.id)}
                          disabled={actionLoading === `clear-${log.id}`}
                          title="Clear from view"
                        >
                          {actionLoading === `clear-${log.id}` ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />}
                        </Button>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {safeFormat(log.created_at, 'h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decryptLog} onOpenChange={(open) => {
        if (!open) {
          setDecryptLog(null);
          setDecryptEmail('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Identity</DialogTitle>
            <DialogDescription>
              Please enter your email address to proceed with decryption. This ensures secure access tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="decrypt-email" className="text-xs font-bold uppercase tracking-tight text-slate-500">Email Address</Label>
              <Input 
                id="decrypt-email"
                type="email" 
                placeholder="your.email@example.com" 
                value={decryptEmail} 
                onChange={(e) => setDecryptEmail(e.target.value)} 
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDecryptLog(null);
              setDecryptEmail('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!decryptEmail || !decryptLog) return;
                const { id, fileId, fileName } = decryptLog;
                setDecryptLog(null);
                setDecryptEmail('');
                try {
                  setActionLoading(`download-${id}`);
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) throw new Error("Authentication session not found.");
                  const res = await fetch(`/api/pdf/download/${fileId}`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                  });
                  if (!res.ok) throw new Error(await res.text());
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = fileName.replace('.enc', '');
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                } catch (e: any) {
                  toast({ title: 'Download failed', description: e.message, variant: 'destructive', className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
                } finally {
                  setActionLoading(null);
                }
              }}
              disabled={!decryptEmail}
            >
              Confirm & Decrypt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function formatDetails(rawDetails: any): string {
  if (!rawDetails) return '';
  
  let details = rawDetails;
  
  // Force parse if the database returned a stringified JSON object
  if (typeof rawDetails === 'string') {
    try {
      details = JSON.parse(rawDetails);
    } catch (e) {
      return rawDetails; // It's just normal text, return it
    }
  }

  if (typeof details !== 'object' || details === null) {
    return String(details);
  }

  const parts: string[] = [];
  
  if (details.domain) parts.push(`Domain: ${details.domain}`);
  if (details.score !== undefined) parts.push(`Score: ${details.score}`);
  if (details.email) parts.push(`Email: ${details.email}`);
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.name) parts.push(details.name);
  if (details.fileName) parts.push(`File: ${details.fileName}`);
  if (details.sharedWith) parts.push(`Shared with: ${details.sharedWith}`);
  if (details.permissionLevel) parts.push(`Permission: ${details.permissionLevel}`);
  if (details.expiresAt) parts.push(`Expires: ${details.expiresAt}`);
  if (details.error) parts.push(`Error: ${details.error}`);
  if (details.message) parts.push(details.message);
  if (details.details) {
    let nestedDetails = details.details;
    
    // Try to parse the nested details if it's a stringified JSON object
    if (typeof nestedDetails === 'string') {
      try {
        const parsed = JSON.parse(nestedDetails);
        if (typeof parsed === 'object' && parsed !== null) {
          nestedDetails = parsed;
        }
      } catch (e) {
        // Keep as normal string if parsing fails
      }
    }

    if (typeof nestedDetails === 'string') {
      parts.push(nestedDetails);
    } else if (typeof nestedDetails === 'object' && nestedDetails !== null) {
      if (nestedDetails.message) {
        parts.push(nestedDetails.message);
      } else {
        parts.push(JSON.stringify(nestedDetails));
      }
    }
  }


  return parts.join(' • ') || JSON.stringify(details);
}
