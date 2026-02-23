import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Link, AlertTriangle, CheckCircle2, AlertCircle, Loader2, ShieldAlert, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PhishingCheck as PhishingCheckType, RedFlag } from '@/types';

// Mock analysis result
const mockAnalysis: PhishingCheckType = {
  id: 'new',
  type: 'email',
  content: '',
  checkedAt: new Date().toISOString(),
  riskLevel: 'high',
  verdict: 'Very likely a phishing attempt',
  redFlags: [
    { id: '1', title: 'Suspicious sender domain', description: 'The email appears to be from a fake or lookalike domain.', severity: 'high' },
    { id: '2', title: 'Urgent language used', description: 'Uses pressure tactics to make you act without thinking.', severity: 'high' },
    { id: '3', title: 'Requests sensitive information', description: 'Asks for passwords, banking info, or personal data.', severity: 'medium' },
  ],
};

export default function PhishingCheck() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('email');
  const [emailContent, setEmailContent] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<PhishingCheckType | null>(null);

  const handleAnalyze = async () => {
    const content = activeTab === 'email' ? emailContent : linkUrl;
    if (!content.trim()) return;

    setIsAnalyzing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setResult(mockAnalysis);
    setIsAnalyzing(false);
  };

  const riskConfig = {
    high: { icon: AlertCircle, color: 'text-severity-critical', bg: 'bg-severity-critical-bg', label: 'High Risk' },
    medium: { icon: AlertTriangle, color: 'text-severity-medium', bg: 'bg-severity-medium-bg', label: 'Medium Risk' },
    low: { icon: CheckCircle2, color: 'text-severity-low', bg: 'bg-severity-low-bg', label: 'Low Risk' },
  };

  const resetAnalysis = () => {
    setResult(null);
    setEmailContent('');
    setEmailSubject('');
    setEmailFrom('');
    setLinkUrl('');
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Phishing Checker</h1>
          <p className="text-muted-foreground mt-1">
            Check if an email or link might be a phishing attempt
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/phishing/history')}>
          View History
        </Button>
      </div>

      {!result ? (
        <Card>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="email" className="gap-2">
                  <Mail className="w-4 h-4" />
                  Check Email
                </TabsTrigger>
                <TabsTrigger value="link" className="gap-2">
                  <Link className="w-4 h-4" />
                  Check Link
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-content">Paste the email content</Label>
                  <Textarea
                    id="email-content"
                    placeholder="Paste the suspicious email body here..."
                    className="min-h-[200px]"
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-subject">Subject (optional)</Label>
                    <Input
                      id="email-subject"
                      placeholder="Email subject line"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-from">From (optional)</Label>
                    <Input
                      id="email-from"
                      placeholder="Sender's email address"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="link-url">Paste the suspicious link</Label>
                  <Input
                    id="link-url"
                    type="url"
                    placeholder="https://suspicious-link.com/..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tip: Right-click on a link and copy the URL rather than clicking on it
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <Button 
              size="lg" 
              className="w-full mt-6"
              onClick={handleAnalyze}
              disabled={isAnalyzing || (activeTab === 'email' ? !emailContent.trim() : !linkUrl.trim())}
            >
              {isAnalyzing ? (
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
          {/* Result Banner */}
          <Card className={cn(
            "border-2",
            result.riskLevel === 'high' && "border-severity-critical",
            result.riskLevel === 'medium' && "border-severity-medium",
            result.riskLevel === 'low' && "border-severity-low",
          )}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center",
                  riskConfig[result.riskLevel].bg
                )}>
                  {(() => {
                    const Icon = riskConfig[result.riskLevel].icon;
                    return <Icon className={cn("w-8 h-8", riskConfig[result.riskLevel].color)} />;
                  })()}
                </div>
                <div>
                  <Badge variant={result.riskLevel === 'high' ? 'critical' : result.riskLevel === 'medium' ? 'medium' : 'low'}>
                    {riskConfig[result.riskLevel].label}
                  </Badge>
                  <h2 className="text-xl font-bold font-display mt-2">{result.verdict}</h2>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Red Flags */}
          {result.redFlags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-severity-high" />
                  Warning Signs Found
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.redFlags.map((flag) => (
                  <div 
                    key={flag.id}
                    className={cn(
                      "p-4 rounded-lg border-l-4",
                      flag.severity === 'high' && "bg-severity-critical-bg/50 border-severity-critical",
                      flag.severity === 'medium' && "bg-severity-medium-bg/50 border-severity-medium",
                      flag.severity === 'low' && "bg-severity-low-bg/50 border-severity-low",
                    )}
                  >
                    <h4 className="font-medium">{flag.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* What to do */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                What You Should Do
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.riskLevel === 'high' && (
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Don't click</strong> any links in this message</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Don't download</strong> any attachments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Don't reply</strong> or provide any information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Report</strong> this email as spam/phishing in your email client</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Delete</strong> the email from your inbox</span>
                  </li>
                </ul>
              )}
              {result.riskLevel === 'medium' && (
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Be cautious</strong> - verify the sender through other means</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Don't click links</strong> - go directly to the website instead</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <span><strong>Call the company</strong> using a number from their official website</span>
                  </li>
                </ul>
              )}
              {result.riskLevel === 'low' && (
                <p className="text-sm text-muted-foreground">
                  This appears to be legitimate, but always stay vigilant. If something feels off, trust your instincts and verify through official channels.
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
