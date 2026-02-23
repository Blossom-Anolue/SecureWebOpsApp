import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Search, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useDomains, useCreateScan } from '@/hooks/useSecurityData';
import { useActivityLogger } from '@/hooks/useActivityLog';
import { Shield } from 'lucide-react';

export default function NewScan() {
  const navigate = useNavigate();
  const { data: domains, isLoading } = useDomains();
  const createScan = useCreateScan();
  const { log } = useActivityLogger();
  
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [scanType, setScanType] = useState<'quick' | 'full'>('quick');

  if (isLoading) {
    return <LoadingState message="Loading domains..." />;
  }

  if (!domains || domains.length === 0) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0 max-w-2xl">
        <Button variant="ghost" onClick={() => navigate('/scans')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Scans
        </Button>
        <EmptyState
          icon={Shield}
          title="No domains to scan"
          description="Add a domain in Settings before you can run a security scan."
          actionLabel="Go to Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  const selectedDomain = domains.find(d => d.id === selectedDomainId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDomainId || !selectedDomain) {
      toast({
        title: "Please select a domain",
        description: "Choose which website you want to scan.",
        variant: "destructive",
      });
      return;
    }

    try {
      const scan = await createScan.mutateAsync({
        domainId: selectedDomainId,
        domain: selectedDomain.domain,
        scanType,
      });
      
      log('scan.started', 'scan', {
        resourceId: scan.id,
        details: { domain: selectedDomain.domain, scanType },
      });
      
      toast({
        title: "Scan started!",
        description: `We're scanning ${selectedDomain.domain}. This may take a few minutes.`,
      });
      navigate('/scans');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start scan. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-2xl">
      {/* Back button */}
      <Button variant="ghost" onClick={() => navigate('/scans')} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to Scans
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-display">Start New Scan</h1>
        <p className="text-muted-foreground mt-1">
          Check your website for security vulnerabilities
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Domain Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Website</CardTitle>
            <CardDescription>Choose which website you want to scan</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a domain" />
              </SelectTrigger>
              <SelectContent>
                {domains.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="link" className="h-auto p-0 mt-2 text-sm" onClick={() => navigate('/settings')}>
              + Add new domain
            </Button>
          </CardContent>
        </Card>

        {/* Scan Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Scan Type</CardTitle>
            <CardDescription>Choose how thorough you want the scan to be</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup 
              value={scanType} 
              onValueChange={(v) => setScanType(v as 'quick' | 'full')}
              className="space-y-3"
            >
              <label
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors",
                  scanType === 'quick' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <RadioGroupItem value="quick" id="quick" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="font-medium">Quick Scan</span>
                    <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">Recommended</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Checks for the most common security issues. Takes about 5 minutes.
                  </p>
                </div>
              </label>

              <label
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors",
                  scanType === 'full' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <RadioGroupItem value="full" id="full" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-primary" />
                    <span className="font-medium">Full Scan</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Comprehensive check of all security aspects. Takes 15-30 minutes.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* What we check */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-4 h-4" />
              What we check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Login page protection and brute force prevention
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                SSL/TLS certificate and encryption settings
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Forms and input validation for injection attacks
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Cookie security and session management
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Sensitive data exposure risks
              </li>
            </ul>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={createScan.isPending}>
          {createScan.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting scan...
            </>
          ) : (
            'Start Scan'
          )}
        </Button>
      </form>
    </div>
  );
}
