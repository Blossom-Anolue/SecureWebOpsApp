import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Shield, Clock, CheckCircle2, XCircle, Loader2, Search, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { useScans, useDomains, useAddDomain } from '@/hooks/useSecurityData';
import { useOrganizations } from '@/hooks/useOrganizations';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const statusConfig = {
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-score-ok' },
  running: { icon: Loader2, label: 'Running', color: 'text-primary' },
  queued: { icon: Loader2, label: 'Queued', color: 'text-primary' },
  pending: { icon: Clock, label: 'Pending', color: 'text-muted-foreground' },
  canceled: { icon: XCircle, label: 'Canceled', color: 'text-muted-foreground' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-score-critical' },
};

export default function Scans() {
  const navigate = useNavigate();
  const { data: scans, isLoading: scansLoading } = useScans();
  const { data: domains, isLoading: domainsLoading } = useDomains();
  const { data: organizations } = useOrganizations();
  const addDomain = useAddDomain();
  
  const [newDomain, setNewDomain] = useState('');
  const [newDomainScope, setNewDomainScope] = useState<string>('personal');
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false);

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    
    if (/[<>'"]/.test(newDomain)) {
      toast({
        title: "Invalid Input",
        description: "Domain contains dangerous characters.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      return;
    }

    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(newDomain.trim())) {
      toast({
        title: "Invalid Domain",
        description: "Please enter a valid domain name (e.g., example.com).",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      return;
    }

    try {
      await addDomain.mutateAsync({
        domain: newDomain,
        organizationId: newDomainScope === 'personal' ? null : newDomainScope,
      });
      setNewDomain('');
      setNewDomainScope('personal');
      setIsAddDomainOpen(false);
      toast({
        title: "Domain added",
        description: `${newDomain} has been added to your monitored domains.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add domain. Please try again.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const addDomainDialog = (
    <Dialog open={isAddDomainOpen} onOpenChange={setIsAddDomainOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Domain</DialogTitle>
          <DialogDescription>
            Enter the domain you want to monitor for security vulnerabilities.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-domain">Domain</Label>
            <Input
              id="new-domain"
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            />
          </div>
          {organizations && organizations.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="domain-scope">Ownership</Label>
              <Select value={newDomainScope} onValueChange={setNewDomainScope}>
                <SelectTrigger id="domain-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsAddDomainOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddDomain} disabled={addDomain.isPending}>
            {addDomain.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Domain'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const isLoading = scansLoading || domainsLoading;

  if (isLoading) {
    return <LoadingState message="Loading scans..." />;
  }

  // Check if user has domains first
  if (!domains || domains.length === 0) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent p-6 md:p-8 border border-violet-500/10">
          <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
            <Search className="w-32 h-32 text-violet-600" />
          </div>
          <div className="relative z-10">
            <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Website Scans</h1>
            <p className="text-muted-foreground mt-2 text-lg">Check your website for security vulnerabilities.</p>
          </div>
        </div>
        <EmptyState
          icon={Shield}
          title="Add a domain first"
          description="Before you can run scans, you need to add at least one website domain to monitor."
          actionLabel="Add Domain"
          onAction={() => setIsAddDomainOpen(true)}
        />
        {addDomainDialog}
      </div>
    );
  }

  if (!scans || scans.length === 0) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent p-6 md:p-8 border border-violet-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
            <Search className="w-32 h-32 text-violet-600" />
          </div>
          <div className="relative z-10">
            <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Website Scans</h1>
            <p className="text-muted-foreground mt-2 text-lg">Check your website for security vulnerabilities.</p>
          </div>
          <div className="relative z-10 flex flex-wrap gap-2">
            <Button variant="outline" className="shadow-md bg-white/50 backdrop-blur-sm dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900" onClick={() => setIsAddDomainOpen(true)}>
              <Globe className="w-4 h-4 mr-2" />
              Add Domain
            </Button>
            <Button className="shadow-md" onClick={() => navigate('/scans/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Run New Scan
            </Button>
          </div>
        </div>
        <EmptyState
          icon={Shield}
          title="No scans yet"
          description="Start by running your first scan to see how secure your website is."
          actionLabel="Run first scan"
          onAction={() => navigate('/scans/new')}
        />
        {addDomainDialog}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent p-6 md:p-8 border border-violet-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
          <Search className="w-32 h-32 text-violet-600" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Website Scans</h1>
          <p className="text-muted-foreground mt-2 text-lg">Check your website for security vulnerabilities.</p>
        </div>
          <div className="relative z-10 flex flex-wrap gap-2">
            <Button variant="outline" className="shadow-md bg-white/50 backdrop-blur-sm dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900" onClick={() => setIsAddDomainOpen(true)}>
              <Globe className="w-4 h-4 mr-2" />
              Add Domain
            </Button>
            <Button className="shadow-md" onClick={() => navigate('/scans/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Run New Scan
            </Button>
          </div>
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
                      {format(new Date(scan.started_at ?? scan.created_at ?? new Date().toISOString()), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <StatusIcon className={cn(
                      "w-4 h-4",
                      status.color,
                      (scan.status === 'running' || scan.status === 'queued') && "animate-spin"
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
      {addDomainDialog}
    </div>
  );
}
