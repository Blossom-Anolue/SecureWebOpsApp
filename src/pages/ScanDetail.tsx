import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Globe, ChevronDown, Copy, CheckCircle2, Loader2, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/common/SeverityBadge';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useScan, useScanIssues } from '@/hooks/useSecurityData';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export default function ScanDetail() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [openIssues, setOpenIssues] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const { data: scan, isLoading: scanLoading, error: scanError, refetch } = useScan(scanId);
  const { data: issues, isLoading: issuesLoading } = useScanIssues(scanId);

  // Poll for updates while scan is running
  useEffect(() => {
    if (scan?.status === 'pending' || scan?.status === 'running') {
      const interval = setInterval(() => {
        refetch();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [scan?.status, refetch]);

  const downloadPdfReport = async () => {
    if (!scanId) return;
    
    setIsDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('generate-pdf-report', {
        body: { scanId },
      });

      if (error) throw error;

      // Open HTML in new window for printing/saving as PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }

      toast({
        title: "Report ready",
        description: "Use your browser's print dialog to save as PDF.",
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "Failed to generate report",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (scanLoading) {
    return <LoadingState message="Loading scan details..." />;
  }

  if (scanError || !scan) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <Button variant="ghost" onClick={() => navigate('/scans')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Scans
        </Button>
        <ErrorState 
          title="Scan not found"
          description="We couldn't find this scan. It may have been deleted or the link is incorrect."
          onRetry={() => navigate('/scans')}
        />
      </div>
    );
  }

  const toggleIssue = (id: string) => {
    setOpenIssues(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const copyRecommendation = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Recommendation copied to clipboard.",
    });
  };

  const isScanning = scan.status === 'pending' || scan.status === 'running';

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Back button */}
      <Button variant="ghost" onClick={() => navigate('/scans')} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to Scans
      </Button>

      {/* Scan Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            {/* Score or Status */}
            {isScanning ? (
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-primary/10">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : scan.status === 'failed' ? (
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-destructive/10">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
            ) : scan.score !== null ? (
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold",
                scan.score >= 80 ? "bg-score-ok-bg text-score-ok" :
                scan.score >= 50 ? "bg-score-at-risk-bg text-score-at-risk" :
                "bg-score-critical-bg text-score-critical"
              )}>
                {scan.score}
              </div>
            ) : null}
            
            {/* Details */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <h1 className="text-xl font-bold font-display">{scan.domain}</h1>
                <Badge variant="secondary">{scan.scan_type === 'quick' ? 'Quick' : 'Full'} Scan</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {format(new Date(scan.started_at), 'MMM d, yyyy · h:mm a')}
                </span>
                {isScanning ? (
                  <span className="flex items-center gap-1 text-primary">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning...
                  </span>
                ) : scan.status === 'completed' ? (
                  <span className="flex items-center gap-1 text-score-ok">
                    <CheckCircle2 className="w-4 h-4" />
                    Completed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    Failed
                  </span>
                )}
              </div>
            </div>

            {/* Download PDF button */}
            {scan.status === 'completed' && (
              <Button
                variant="outline"
                onClick={downloadPdfReport}
                disabled={isDownloading}
                className="gap-2"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download Report
              </Button>
            )}
          </div>

          {/* Severity Summary - only show when completed */}
          {scan.status === 'completed' && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
              <Badge variant="critical">{scan.critical_count || 0} Critical</Badge>
              <Badge variant="high">{scan.high_count || 0} High</Badge>
              <Badge variant="medium">{scan.medium_count || 0} Medium</Badge>
              <Badge variant="low">{scan.low_count || 0} Low</Badge>
            </div>
          )}

          {/* Scanning message */}
          {isScanning && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                AI is analyzing your website for security vulnerabilities. This usually takes 1-2 minutes for quick scans.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues List */}
      {scan.status === 'completed' && (
        <div>
          <h2 className="text-lg font-semibold font-display mb-4">Security Issues Found</h2>
          
          {issuesLoading ? (
            <LoadingState message="Loading issues..." />
          ) : !issues || issues.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-score-ok mx-auto mb-4" />
                <h3 className="font-semibold text-lg">No issues found!</h3>
                <p className="text-muted-foreground mt-1">Your website looks secure. Keep up the good work!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => (
                <Collapsible 
                  key={issue.id}
                  open={openIssues.includes(issue.id)}
                  onOpenChange={() => toggleIssue(issue.id)}
                >
                  <Card variant="elevated">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-start gap-4">
                          <SeverityBadge severity={issue.severity} />
                          <div className="flex-1">
                            <CardTitle className="text-base">{issue.title}</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">{issue.category}</p>
                          </div>
                          <ChevronDown className={cn(
                            "w-5 h-5 text-muted-foreground transition-transform",
                            openIssues.includes(issue.id) && "rotate-180"
                          )} />
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-4">
                        {/* Description */}
                        <div>
                          <h4 className="text-sm font-medium mb-1">What's happening</h4>
                          <p className="text-sm text-muted-foreground">{issue.description}</p>
                        </div>

                        {/* Business Impact */}
                        <div className="p-3 rounded-lg bg-severity-high-bg/50 border border-severity-high/20">
                          <h4 className="text-sm font-medium text-severity-high mb-1">What this means for your business</h4>
                          <p className="text-sm text-foreground">{issue.business_impact}</p>
                        </div>

                        {/* Recommendation */}
                        <div className="p-3 rounded-lg bg-score-ok-bg/50 border border-score-ok/20">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-medium text-score-ok">What you should do</h4>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-xs"
                              onClick={() => copyRecommendation(issue.recommendation)}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </Button>
                          </div>
                          <p className="text-sm text-foreground">{issue.recommendation}</p>
                        </div>

                        {/* Technical Details (collapsible) */}
                        {issue.technical_details && (
                          <details className="text-sm">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              Technical details (for developers)
                            </summary>
                            <p className="mt-2 p-3 rounded-lg bg-muted text-muted-foreground font-mono text-xs">
                              {issue.technical_details}
                            </p>
                          </details>
                        )}

                        {/* OWASP Category */}
                        {issue.owasp_category && (
                          <p className="text-xs text-muted-foreground">
                            OWASP: {issue.owasp_category}
                          </p>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Failed state */}
      {scan.status === 'failed' && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="font-semibold text-lg">Scan failed</h3>
            <p className="text-muted-foreground mt-1 mb-4">
              Something went wrong while scanning your website. Please try again.
            </p>
            <Button onClick={() => navigate('/scans/new')}>
              Start New Scan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
