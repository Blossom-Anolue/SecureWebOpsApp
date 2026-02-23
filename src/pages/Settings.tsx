import { useState, useEffect } from 'react';
import { Building2, Globe, Bell, Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/common/LoadingState';
import { ScanScheduleCard } from '@/components/settings/ScanScheduleCard';
import { useProfile, useUpdateProfile, useNotificationSettings, useUpdateNotificationSettings, useDomains, useAddDomain } from '@/hooks/useSecurityData';
import { useAuth } from '@/contexts/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: notificationSettings, isLoading: notificationsLoading } = useNotificationSettings();
  const { data: domains, isLoading: domainsLoading } = useDomains();
  const updateProfile = useUpdateProfile();
  const updateNotifications = useUpdateNotificationSettings();
  const addDomain = useAddDomain();

  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyCritical, setNotifyCritical] = useState(true);
  const [notifyWeekly, setNotifyWeekly] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false);

  // Initialize form values from fetched data
  useEffect(() => {
    if (profile) {
      setBusinessName(profile.business_name || '');
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

  if (isLoading) {
    return <LoadingState message="Loading settings..." />;
  }

  const handleSave = async () => {
    try {
      await Promise.all([
        updateProfile.mutateAsync({
          business_name: businessName,
          industry,
        }),
        updateNotifications.mutateAsync({
          email_notifications: notifyEmail,
          critical_alerts: notifyCritical,
          weekly_summary: notifyWeekly,
        }),
      ]);
      
      toast({
        title: "Settings saved",
        description: "Your changes have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    
    try {
      await addDomain.mutateAsync(newDomain);
      setNewDomain('');
      setIsAddDomainOpen(false);
      toast({
        title: "Domain added",
        description: `${newDomain} has been added to your monitored domains.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add domain. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isSaving = updateProfile.isPending || updateNotifications.isPending;

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold font-display">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your business information and preferences
        </p>
      </div>

      {/* Business Info */}
      <Card>
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
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
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
          <div className="pt-2">
            <p className="text-sm text-muted-foreground">
              Signed in as: <span className="font-medium text-foreground">{user?.email}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Domains */}
      <Card>
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
                  <p className="font-medium">{domain.domain}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(domain.created_at).toLocaleDateString()}
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

      {/* Notifications */}
      <Card>
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

      {/* Save Button */}
      <Button size="lg" className="w-full" onClick={handleSave} disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </>
        )}
      </Button>
    </div>
  );
}
