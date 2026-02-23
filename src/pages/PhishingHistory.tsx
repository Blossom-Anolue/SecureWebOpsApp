import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Link, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { usePhishingChecks } from '@/hooks/useSecurityData';
import { format } from 'date-fns';

const riskConfig = {
  high: { icon: AlertCircle, variant: 'critical' as const, label: 'High Risk' },
  medium: { icon: AlertTriangle, variant: 'medium' as const, label: 'Medium Risk' },
  low: { icon: CheckCircle2, variant: 'low' as const, label: 'Low Risk' },
};

export default function PhishingHistory() {
  const navigate = useNavigate();
  const { data: phishingChecks, isLoading } = usePhishingChecks();

  if (isLoading) {
    return <LoadingState message="Loading history..." />;
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Back button */}
      <Button variant="ghost" onClick={() => navigate('/phishing/check')} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to Checker
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-display">Check History</h1>
        <p className="text-muted-foreground mt-1">
          Previous emails and links you've checked
        </p>
      </div>

      {!phishingChecks || phishingChecks.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No checks yet"
          description="When you check emails or links for phishing, they'll appear here."
          actionLabel="Check something now"
          onAction={() => navigate('/phishing/check')}
        />
      ) : (
        <div className="space-y-3">
          {phishingChecks.map((check) => {
            const risk = riskConfig[check.risk_level];
            const RiskIcon = risk.icon;
            
            return (
              <Card key={check.id} variant="elevated">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    {/* Type Icon */}
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      {check.check_type === 'email' ? (
                        <Mail className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <Link className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={risk.variant}>
                          <RiskIcon className="w-3 h-3 mr-1" />
                          {risk.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(check.checked_at), 'MMM d, yyyy · h:mm a')}
                        </span>
                      </div>
                      
                      {check.check_type === 'email' ? (
                        <>
                          {check.subject && (
                            <h3 className="font-medium truncate">{check.subject}</h3>
                          )}
                          {check.sender_email && (
                            <p className="text-sm text-muted-foreground truncate">From: {check.sender_email}</p>
                          )}
                        </>
                      ) : (
                        <p className="font-mono text-sm truncate">{check.content}</p>
                      )}
                      
                      <p className="text-sm text-foreground mt-2">{check.verdict}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
