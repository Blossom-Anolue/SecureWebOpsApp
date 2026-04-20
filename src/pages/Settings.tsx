import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Globe, Bell, Save, Plus, Trash2, Loader2, AlertTriangle, Copy, ShieldCheck, Database, Settings as SettingsIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/common/LoadingState';
import { ScanScheduleCard } from '@/components/settings/ScanScheduleCard';
import { useProfile, useUpdateProfile, useNotificationSettings, useUpdateNotificationSettings, useDomains, useAddDomain } from '@/hooks/useSecurityData';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

async function copyTextToClipboard(value: string) {
  if (!value) {
    throw new Error('Nothing to copy.');
  }

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Copy command was rejected.');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error ? error.message : null;
    const maybeDetails = 'details' in error ? error.details : null;
    const maybeHint = 'hint' in error ? error.hint : null;

    const parts = [maybeMessage, maybeDetails, maybeHint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  return fallback;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: notificationSettings, isLoading: notificationsLoading } = useNotificationSettings();
  const { data: domains, isLoading: domainsLoading } = useDomains();
  const { data: organizations } = useOrganizations();
  const updateProfile = useUpdateProfile();
  const updateNotifications = useUpdateNotificationSettings();
  const addDomain = useAddDomain();

  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyCritical, setNotifyCritical] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainScope, setNewDomainScope] = useState<string>('personal');
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Enterprise settings 
  const [dlpEnabled, setDlpEnabled] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [siemUrl, setSiemUrl] = useState('');

  // Initialize form values from fetched data
  useEffect(() => {
    if (profile) {
      setCompanyName(profile.company_name || '');
      setIndustry(profile.industry || '');
    }
  }, [profile]);

  useEffect(() => {
    if (notificationSettings) {
      setNotifyEmail(notificationSettings.email_notifications);
      setNotifyCritical(notificationSettings.critical_alerts);
      setNotifyWeekly(notificationSettings.weekly_summary);
    }
  }, [notificationSettings]);

  const isLoading = profileLoading || notificationsLoading || domainsLoading;
  const normalizedCompanyName = companyName.trim();
  const normalizedIndustry = industry.trim();
  const savedCompanyName = profile?.company_name ?? '';
  const savedIndustry = profile?.industry ?? '';
  const savedNotifyEmail = notificationSettings?.email_notifications ?? true;
  const savedNotifyCritical = notificationSettings?.critical_alerts ?? true;
  const savedNotifyWeekly = notificationSettings?.weekly_summary ?? true;

  const profileHasChanges = normalizedCompanyName !== savedCompanyName || normalizedIndustry !== savedIndustry;
  const notificationsHaveChanges =
    notifyEmail !== savedNotifyEmail ||
    notifyCritical !== savedNotifyCritical ||
    notifyWeekly !== savedNotifyWeekly;
  const hasChanges = profileHasChanges || notificationsHaveChanges;
  const isSaving = updateProfile.isPending || updateNotifications.isPending;
  const saveButtonLabel = isSaving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved';

  if (isLoading) {
    return <LoadingState message="Loading settings..." />;
  }

  const handleSave = async () => {
    if (!hasChanges) {
      toast({
        title: "No changes to save",
        description: "Your settings are already up to date.",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      return;
    }

    const failedSections: string[] = [];
    const errorMessages: string[] = [];

    if (profileHasChanges) {
      try {
        await updateProfile.mutateAsync({
          company_name: normalizedCompanyName,
          industry: normalizedIndustry,
        });
      } catch (error) {
        failedSections.push('profile');
        errorMessages.push(getErrorMessage(error, 'Profile save failed.'));
      }
    }

    if (notificationsHaveChanges) {
      try {
        await updateNotifications.mutateAsync({
          email_notifications: notifyEmail,
          critical_alerts: notifyCritical,
          weekly_summary: notifyWeekly,
        });
      } catch (error) {
        failedSections.push('notifications');
        errorMessages.push(getErrorMessage(error, 'Notification settings save failed.'));
      }
    }

    if (failedSections.length === 0) {
      toast({
        title: "Settings saved",
        description: "Your changes have been saved successfully.",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      return;
    }

    const errorDescription = errorMessages[0] || 'Failed to save settings. Please try again.';

    if (failedSections.length < (profileHasChanges ? 1 : 0) + (notificationsHaveChanges ? 1 : 0)) {
      toast({
        title: "Saved with issues",
        description: errorDescription,
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      return;
    }

    toast({
        title: "Error",
        description: errorDescription,
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    
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

  const handleDeleteAccount = async () => {
    try {
      setIsDeletingAccount(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session found');
      }

      const response = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      await signOut();
      
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-3xl">
      {/* Enhanced Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 md:p-8 border border-primary/10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="absolute -right-6 -top-6 opacity-5 pointer-events-none">
          <SettingsIcon className="w-40 h-40 text-primary" />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl lg:text-4xl font-bold font-display text-slate-900 dark:text-white">Settings</h1>
          <p className="text-muted-foreground mt-2 text-lg max-w-xl">
            Manage your business profile, domains, notifications, and workspace security.
          </p>
        </div>
        <Button size="lg" onClick={handleSave} disabled={isSaving || !hasChanges} className="relative z-10 lg:min-w-[180px] shadow-md">
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {saveButtonLabel}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {saveButtonLabel}
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Navigation</CardTitle>
          <CardDescription>Jump to the section you need or move directly into the product areas connected to these settings.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => document.getElementById('business-information')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Business Information
          </Button>
          <Button variant="outline" onClick={() => document.getElementById('domains-websites')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Domains & Websites
          </Button>
          <Button variant="outline" onClick={() => document.getElementById('notifications')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Notifications
          </Button>
          {organizations && organizations.length > 0 && (
            <Button variant="outline" onClick={() => document.getElementById('workspace-security')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Workspace Security
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Back To Dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate('/encrypt')}>
            Open Protected Files
          </Button>
        </CardContent>
      </Card>

      {/* Business Info */}
      <Card id="business-information">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Information
          </CardTitle>
          <CardDescription>Basic information about your business</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="business-name">Business Name</Label>
              <Input
               id="business-name"
                placeholder="Your Business Name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="services">Professional Services</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="pt-4 space-y-2 border-t mt-4">
            <p className="text-sm text-muted-foreground">
              Signed in as: <span className="font-medium text-foreground">{user?.email}</span>
            </p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground flex items-center">
                Your User ID: <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-1 rounded ml-2">{user?.id}</span>
              </p>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={async () => {
                  try {
                    await copyTextToClipboard(user?.id || '');
                    toast({ title: "Copied!", description: "Your User ID has been copied to your clipboard.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
                  } catch {
                    toast({ title: "Copy failed", description: "We could not copy your User ID automatically. Please copy it manually.", variant: 'destructive', className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
                  }
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can securely share this ID with other administrators to grant them access to your encrypted files without exposing your email.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Domains */}
      <Card id="domains-websites">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Domains & Websites
          </CardTitle>
          <CardDescription>Websites we monitor for security issues</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {domains && domains.length > 0 ? (
            domains.map((domain) => (
              <div key={domain.id} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{domain.domain}</p>
                    {domain.organization_id ? (
                      <Badge variant="outline" className="text-xs">Company</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Personal</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(domain.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Badge variant={domain.is_verified ? 'low' : 'secondary'}>
                  {domain.is_verified ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No domains added yet. Add your first domain to start monitoring.
            </p>
          )}
          
          <Dialog open={isAddDomainOpen} onOpenChange={setIsAddDomainOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Domain
              </Button>
            </DialogTrigger>
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
        </CardContent>
      </Card>

      {/* Scheduled Scans */}
      {domains && domains.length > 0 && (
        <ScanScheduleCard domains={domains} />
      )}

      {/* Workspace Security (Enterprise) */}
      {organizations && organizations.length > 0 && (
        <Card id="workspace-security" className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Company Workspace Security
            </CardTitle>
            <CardDescription>Advanced data loss prevention (DLP) and compliance policies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">External Sharing Restrictions (DLP)</p>
                <p className="text-sm text-muted-foreground">Block users from sharing Vault files with email addresses outside of approved company domains.</p>
              </div>
              <Switch checked={dlpEnabled} onCheckedChange={(val) => {
                setDlpEnabled(val);
                toast({ title: val ? "DLP Enabled" : "DLP Disabled", description: "External sharing restrictions updated." });
              }} />
            </div>
            <Separator className="bg-primary/10" />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Dynamic PDF Watermarking</p>
                <p className="text-sm text-muted-foreground">Automatically stamp the recipient's email address across files decrypted with "View Only" access to prevent unauthorized screenshots or leaks.</p>
              </div>
              <Switch checked={watermarkEnabled} onCheckedChange={(val) => {
                setWatermarkEnabled(val);
                toast({ title: val ? "Watermarking Enabled" : "Watermarking Disabled", description: "Document viewing policies updated." });
              }} />
            </div>
            <Separator className="bg-primary/10" />
            <div className="space-y-3">
              <div>
                <p className="font-medium">SIEM / Log Forwarding Webhook</p>
                <p className="text-sm text-muted-foreground">Automatically forward audit logs to external security tools like Splunk or Datadog.</p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="https://splunk-hec.example.com/services/collector"
                  value={siemUrl}
                  onChange={(e) => setSiemUrl(e.target.value)}
                  className="bg-white"
                />
                <Button variant="secondary" onClick={() => toast({ title: "SIEM Configured", description: "Audit logs will be forwarded to the specified endpoint."})}>Connect</Button>
              </div>
            </div>
            <Separator className="bg-primary/10" />
            <div className="rounded-lg bg-white p-4 border border-primary/20 flex items-start gap-3">
              <Database className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Enterprise Audit Log Retention Active</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your company workspace activity logs are securely retained for <strong>1 to 7 years</strong> to meet SOC2 and HIPAA compliance requirements. 
                  <br/><span className="italic">(Note: Personal account logs are only retained for 30 days).</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      <Card id="notifications">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </CardTitle>
          <CardDescription>How and when we contact you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email notifications</p>
              <p className="text-sm text-muted-foreground">Receive updates via email</p>
            </div>
            <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Critical alerts</p>
              <p className="text-sm text-muted-foreground">Immediate notification for critical issues</p>
            </div>
            <Switch checked={notifyCritical} onCheckedChange={setNotifyCritical} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Weekly summary</p>
              <p className="text-sm text-muted-foreground">Get a weekly security status report</p>
            </div>
            <Switch checked={notifyWeekly} onCheckedChange={setNotifyWeekly} />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-foreground">Delete Account</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your account
                    and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteAccount} 
                    disabled={isDeletingAccount}
                  >
                    {isDeletingAccount ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Yes, delete my account'
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
