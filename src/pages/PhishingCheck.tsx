import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Link as LinkIcon,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  BookOpen,
  Building2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { useAnalyzePhishing, type AnalyzePhishingResult } from '@/hooks/useSecurityData';
import { useOrganizations } from '@/hooks/useOrganizations';

const riskConfig = {
  high: { icon: AlertCircle, color: 'text-severity-critical', bg: 'bg-severity-critical-bg', label: 'High Risk' },
  medium: { icon: AlertTriangle, color: 'text-severity-medium', bg: 'bg-severity-medium-bg', label: 'Medium Risk' },
  low: { icon: CheckCircle2, color: 'text-severity-low', bg: 'bg-severity-low-bg', label: 'Low Risk' },
} as const;

export default function PhishingCheck() {
  const navigate = useNavigate();
  const { data: organizations } = useOrganizations();
  const analyzePhishing = useAnalyzePhishing();

  const [activeTab, setActiveTab] = useState<'email' | 'link'>('email');
  const [emailContent, setEmailContent] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedScope, setSelectedScope] = useState('personal');
  const [result, setResult] = useState<AnalyzePhishingResult | null>(null);

  const selectedOrganization = useMemo(
    () => organizations?.find((org) => org.id === selectedScope) ?? null,
    [organizations, selectedScope]
  );

  const handleAnalyze = async () => {
    const content = activeTab === 'email' ? emailContent : linkUrl;
    if (!content.trim()) return;

    try {
      const nextResult = await analyzePhishing.mutateAsync({
        type: activeTab,
        content,
        subject: activeTab === 'email' ? emailSubject : undefined,
        senderEmail: activeTab === 'email' ? emailFrom : undefined,
        organizationId: selectedScope === 'personal' ? null : selectedScope,
      });

      setResult(nextResult);
      toast({
        title: 'Phishing check complete',
        description: selectedScope === 'personal'
          ? 'Your result was saved to your personal phishing history.'
          : `Your result was saved under ${selectedOrganization?.name ?? 'your company workspace'}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Unable to analyze the content right now.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const resetAnalysis = () => {
    setResult(null);
    setEmailContent('');
    setEmailSubject('');
    setEmailFrom('');
    setLinkUrl('');
  };

  const scopeLabel = selectedScope === 'personal'
    ? 'Personal workspace'
    : `${selectedOrganization?.name ?? 'Company workspace'}`;

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Phishing Checker</h1>
          <p className="text-muted-foreground mt-1">
            Analyze suspicious emails or links and save the result to the correct personal or company workspace.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/phishing/history')}>
          View History
        </Button>
      </div>

      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle>Analyze Suspicious Content</CardTitle>
            <CardDescription>
              This uses the merged Phish Guard heuristic engine and saves real red flags to your account history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="phishing-scope">Save to</Label>
              <Select value={selectedScope} onValueChange={setSelectedScope}>
                <SelectTrigger id="phishing-scope">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">
                    <span className="inline-flex items-center gap-2">
                      <UserRound className="w-4 h-4" />
                      Personal workspace
                    </span>
                  </SelectItem>
                  {organizations?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        {org.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Personal checks stay private to your account. Company checks are saved only inside that company workspace.
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'email' | 'link')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email" className="gap-2">
                  <Mail className="w-4 h-4" />
                  Check Email
                </TabsTrigger>
                <TabsTrigger value="link" className="gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Check Link
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4 pt-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-subject">Subject</Label>
                    <Input
                      id="email-subject"
                      placeholder="Urgent: Verify your account"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-from">Sender</Label>
                    <Input
                      id="email-from"
                      placeholder="support@example.com"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-content">Email content</Label>
                  <Textarea
                    id="email-content"
                    placeholder="Paste the suspicious email body here..."
                    className="min-h-[220px]"
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="link-url">Link to analyze</Label>
                  <Input
                    id="link-url"
                    type="url"
                    placeholder="https://suspicious-link.example"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the suspicious URL. The checker looks for phishing patterns like misleading domains, shorteners, and unsafe link structure.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <Button
              size="lg"
              className="w-full"
              onClick={handleAnalyze}
              disabled={analyzePhishing.isPending || (activeTab === 'email' ? !emailContent.trim() : !linkUrl.trim())}
            >
              {analyzePhishing.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  Check for Phishing
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <Card className={cn(
            'border-2',
            result.riskLevel === 'high' && 'border-severity-critical',
            result.riskLevel === 'medium' && 'border-severity-medium',
            result.riskLevel === 'low' && 'border-severity-low',
          )}>
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center',
                    riskConfig[result.riskLevel].bg
                  )}>
                    {(() => {
                      const Icon = riskConfig[result.riskLevel].icon;
                      return <Icon className={cn('w-8 h-8', riskConfig[result.riskLevel].color)} />;
                    })()}
                  </div>
                  <div>
                    <Badge variant={result.riskLevel === 'high' ? 'critical' : result.riskLevel === 'medium' ? 'medium' : 'low'}>
                      {riskConfig[result.riskLevel].label}
                    </Badge>
                    <h2 className="text-xl font-bold font-display mt-2">{result.verdict}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Saved to {scopeLabel} using the {result.source} analyzer.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border px-5 py-4 text-center min-w-[120px]">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Risk Score</p>
                  <p className="text-3xl font-bold font-display">{result.riskScore}</p>
                  <p className="text-xs text-muted-foreground">out of 100</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-severity-high" />
                Red Flags Found
              </CardTitle>
              <CardDescription>
                These are the specific phishing indicators detected in the content you submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.redFlags.length > 0 ? result.redFlags.map((flag, index) => (
                <div
                  key={`${flag.title}-${index}`}
                  className={cn(
                    'p-4 rounded-lg border-l-4',
                    flag.severity === 'high' && 'bg-severity-critical-bg/50 border-severity-critical',
                    flag.severity === 'medium' && 'bg-severity-medium-bg/50 border-severity-medium',
                    flag.severity === 'low' && 'bg-severity-low-bg/50 border-severity-low',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{flag.title}</h4>
                    <Badge variant={flag.severity === 'high' ? 'critical' : flag.severity === 'medium' ? 'medium' : 'low'}>
                      {flag.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">
                  No major phishing indicators were detected in this submission.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Recommended Next Steps
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {result.riskLevel === 'high' && (
                <ul className="space-y-2">
                  <li>Do not click any links or download attachments from this message.</li>
                  <li>Verify the sender or site through a trusted channel before taking any action.</li>
                  <li>Report the message to your security or IT team if it targets your company.</li>
                </ul>
              )}
              {result.riskLevel === 'medium' && (
                <ul className="space-y-2">
                  <li>Treat the content as suspicious until the sender or destination is independently verified.</li>
                  <li>Go to the official website manually instead of clicking embedded links.</li>
                  <li>Escalate the message internally if it appears to target a shared company workflow.</li>
                </ul>
              )}
              {result.riskLevel === 'low' && (
                <p className="text-muted-foreground">
                  The checker did not find strong phishing signals, but unexpected login, payment, or verification requests should still be confirmed through official channels.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={resetAnalysis} className="flex-1">
              Check Another
            </Button>
            <Button variant="outline" onClick={() => navigate('/phishing/history')}>
              View History
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
