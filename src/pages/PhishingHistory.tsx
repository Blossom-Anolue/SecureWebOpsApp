import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Link as LinkIcon, AlertCircle, AlertTriangle, CheckCircle2, Building2, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { useOrganizations } from '@/hooks/useOrganizations';
import { usePhishingChecks } from '@/hooks/useSecurityData';

const riskConfig = {
  high: { icon: AlertCircle, variant: 'critical' as const, label: 'High Risk' },
  medium: { icon: AlertTriangle, variant: 'medium' as const, label: 'Medium Risk' },
  low: { icon: CheckCircle2, variant: 'low' as const, label: 'Low Risk' },
};

export default function PhishingHistory() {
  const navigate = useNavigate();
  const { data: organizations } = useOrganizations();
  const [selectedScope, setSelectedScope] = useState('personal');
  const organizationId = selectedScope === 'personal' ? undefined : selectedScope;
  const { data: phishingChecks, isLoading } = usePhishingChecks(organizationId);

  const selectedOrganization = useMemo(
    () => organizations?.find((org) => org.id === selectedScope) ?? null,
    [organizations, selectedScope]
  );

  if (isLoading) {
    return <LoadingState message="Loading phishing history..." />;
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <Button variant="ghost" onClick={() => navigate('/phishing/check')} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        Back to Checker
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Phishing History</h1>
          <p className="text-muted-foreground mt-1">
            Review saved phishing checks for your personal account or a company workspace.
          </p>
        </div>
        <div className="w-full sm:w-[280px] space-y-2">
          <label className="text-sm font-medium">Viewing</label>
          <Select value={selectedScope} onValueChange={setSelectedScope}>
            <SelectTrigger>
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">
                <span className="inline-flex items-center gap-2">
                  <UserRound className="w-4 h-4" />
                  Personal history
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {selectedScope === 'personal' ? 'Personal phishing checks' : `${selectedOrganization?.name ?? 'Company'} phishing checks`}
          </CardTitle>
          <CardDescription>
            Results shown here are limited by your tenant permissions and saved scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!phishingChecks || phishingChecks.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No phishing checks yet"
              description="When phishing checks are saved in this workspace, they will appear here."
              actionLabel="Run a phishing check"
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
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          {check.check_type === 'email' ? (
                            <Mail className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <LinkIcon className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant={risk.variant}>
                              <RiskIcon className="w-3 h-3 mr-1" />
                              {risk.label}
                            </Badge>
                            <Badge variant="outline">Score {check.risk_score ?? 0}/100</Badge>
                            <Badge variant="secondary">
                              {check.analysis_source ?? 'heuristic'}
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
        </CardContent>
      </Card>
    </div>
  );
}
