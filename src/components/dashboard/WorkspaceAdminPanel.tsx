import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox,
  BadgeCheck,
  Building2,
  Crown,
  Globe,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Zap,
  Search,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  useAcceptInvite,
  useCreateOrganization,
  useDeclineInvite,
  usePendingInvites,
  useOrganizations,
  useOrganizationMembers,
  useCurrentUserRole,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
  type AppRole,
  type OrganizationMember,
} from '@/hooks/useOrganizations';
import { usePhishingChecks, useProfile, type Domain, type Scan } from '@/hooks/useSecurityData';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityLogger } from '@/hooks/useActivityLog';

const ROLE_BADGE: Record<AppRole, { label: string; tone: string; icon: typeof Crown }> = {
  owner: { label: 'Supa Admin', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: Crown },
  admin: { label: 'Admin', tone: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', icon: ShieldCheck },
  member: { label: 'Member', tone: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', icon: User },
};

interface WorkspaceAdminPanelProps {
  domains: Domain[];
  scans: Scan[];
}

export function WorkspaceAdminPanel({ domains, scans }: WorkspaceAdminPanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: organizations } = useOrganizations();
  const { data: pendingInvites } = usePendingInvites();
  const { data: profile } = useProfile();
  const { log } = useActivityLogger();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const createOrganization = useCreateOrganization();
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('member');
  const [justJoinedWorkspace, setJustJoinedWorkspace] = useState<{ name: string; role: AppRole } | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const inviteMember = useInviteMember();
  const companyName = profile?.company_name?.trim() || '';
  const isCompanyAccount = companyName.length > 0;

  const selectedOrganization = useMemo(() => {
    if (!organizations?.length) return null;
    return organizations.find((org) => org.id === selectedOrgId) ?? organizations[0];
  }, [organizations, selectedOrgId]);

  const { data: members, isLoading: membersLoading } = useOrganizationMembers(selectedOrganization?.id);
  const { data: currentRole } = useCurrentUserRole(selectedOrganization?.id);
  const { data: phishingChecks } = usePhishingChecks(selectedOrganization?.id);

  const canManageWorkspace = currentRole === 'owner' || currentRole === 'admin';
  const roleMeta = currentRole ? ROLE_BADGE[currentRole] : null;

  const scopedDomains = useMemo(
    () => domains.filter((domain) => domain.organization_id === selectedOrganization?.id),
    [domains, selectedOrganization?.id]
  );

  const scopedScans = useMemo(
    () => scans.filter((scan) => scan.organization_id === selectedOrganization?.id),
    [scans, selectedOrganization?.id]
  );

  const completedScans = scopedScans.filter((scan) => scan.status === 'completed');
  const failedScans = scopedScans.filter((scan) => scan.status === 'failed');
  const pendingMemberInvites = members?.filter((member) => !member.joined_at) ?? [];
  const activeMembers = members?.filter((member) => !!member.joined_at) ?? [];
  const latestWorkspaceScan = completedScans[0] ?? null;
  const highRiskPhishing = phishingChecks?.filter((check) => check.risk_level === 'high').length ?? 0;

  const filteredMembers = members?.filter(m => 
    (canManageWorkspace || m.user_id === user?.id) && 
    (m.invited_email?.toLowerCase().includes(memberSearch.toLowerCase()) || m.user_id?.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  const handleExportMembers = () => {
    if (!members || !selectedOrganization) return;
    
    const csvContent = [
      ['Email/ID', 'Role', 'Status', 'Joined Date'].join(','),
      ...members.map(m => [
        m.invited_email || m.user_id || 'Unknown',
        ROLE_BADGE[m.role].label,
        m.joined_at ? 'Active' : 'Pending',
        m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'N/A'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedOrganization.slug}-members.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleInvite = async () => {
    if (!selectedOrganization) return;

    try {
      await inviteMember.mutateAsync({
        organizationId: selectedOrganization.id,
        email: inviteEmail,
        role: inviteRole,
      });

      toast({
        title: 'Workspace invite sent',
        description: `${inviteEmail.trim().toLowerCase()} can join ${selectedOrganization.name} using the same email they registered with.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      setInviteEmail('');
      setInviteRole('member');
    } catch (error: any) {
      toast({
        title: 'Invite failed',
        description: error?.message || 'We could not send that workspace invite.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleAcceptInvite = async (invite: OrganizationMember) => {
    try {
      await acceptInvite.mutateAsync({
        membershipId: invite.id,
        organizationId: invite.organization_id,
      });

      setSelectedOrgId(invite.organization_id);
      setJustJoinedWorkspace({
        name: invite.organizations?.name || 'Company workspace',
        role: invite.role,
      });
      toast({
        title: 'Workspace joined',
        description: `You are now part of ${invite.organizations?.name || 'the company workspace'}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      toast({
        title: 'Invite acceptance failed',
        description: error?.message || 'We could not accept that invite.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleDeclineInvite = async (invite: OrganizationMember) => {
    try {
      await declineInvite.mutateAsync({
        membershipId: invite.id,
        organizationId: invite.organization_id,
      });

      toast({
        title: 'Invite declined',
        description: `Removed the invitation for ${invite.organizations?.name || 'that workspace'}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      toast({
        title: 'Decline failed',
        description: error?.message || 'We could not decline that invite.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleCreateWorkspace = async () => {
    if (!companyName) return;

    // Prevent free email providers from claiming new company workspaces
    const email = user?.email?.toLowerCase() || '';
    const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
    const userDomain = email.split('@')[1];

    if (freeEmailDomains.includes(userDomain)) {
      toast({
        title: 'Business Email Required',
        description: 'To register a brand new company workspace, you must use a professional business email address.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      return;
    }

    const suggestedSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    try {
      const organization = await createOrganization.mutateAsync({
        name: companyName,
        slug: suggestedSlug,
      });

      setSelectedOrgId(organization.id);
      
      log('team.created', 'organization', {
        resourceId: organization.id,
        organizationId: organization.id,
        details: { name: companyName },
      });

      toast({
        title: 'Company workspace created',
        description: `${companyName} now has a shared workspace with you as Supa Admin.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      const isDuplicate = error?.message?.toLowerCase().includes('duplicate') || error?.message?.toLowerCase().includes('slug');

      toast({
        title: isDuplicate ? 'Company Name Registered' : 'Workspace setup failed',
        description: isDuplicate
          ? `The company "${companyName}" is already registered. To gain access to this workspace, the current administrator must send an invite to your email address.`
          : error?.message || 'We could not create the company workspace.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleRoleChange = async (member: OrganizationMember, nextRole: AppRole) => {
    if (!selectedOrganization || member.role === nextRole) return;

    try {
      await updateMemberRole.mutateAsync({
        memberId: member.id,
        organizationId: selectedOrganization.id,
        role: nextRole,
      });

      toast({
        title: 'Role updated',
        description: `${member.invited_email || 'Member'} is now ${ROLE_BADGE[nextRole].label}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      toast({
        title: 'Role update failed',
        description: error?.message || 'We could not update that member role.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    if (!selectedOrganization) return;

    try {
      await removeMember.mutateAsync({
        memberId: member.id,
        organizationId: selectedOrganization.id,
      });

      toast({
        title: member.joined_at ? 'Member removed' : 'Invite canceled',
        description: `${member.invited_email || 'The workspace entry'} was removed from ${selectedOrganization.name}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      toast({
        title: 'Removal failed',
        description: error?.message || 'We could not remove that workspace member.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  if (!organizations?.length && !pendingInvites?.length && !isCompanyAccount) {
    return null;
  }

  const RoleIcon = roleMeta?.icon ?? Building2;
  const joinedRoleMeta = justJoinedWorkspace ? ROLE_BADGE[justJoinedWorkspace.role] : null;

  return (
    <div className="space-y-4">


      {!!pendingInvites?.length && (
        <Card className="shadow-card border-primary/15 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-cyan-500/10 via-slate-500/5 to-transparent">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-primary" />
                  {pendingInvites.length === 1 ? (pendingInvites[0].organizations?.name || 'Workspace invitation') : 'Workspace invitations'}
                </CardTitle>
                <Badge variant="secondary">Pending Invite{pendingInvites.length > 1 ? 's' : ''}</Badge>
              </div>
              <CardDescription className="max-w-2xl">
                You were invited to join a company workspace. Accept the invite below to unlock the shared company view, workspace scans, and role-based access.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-xl border bg-muted/30 p-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-foreground">{invite.organizations?.name || 'Company workspace'}</p>
                    <Badge className={ROLE_BADGE[invite.role].tone}>{ROLE_BADGE[invite.role].label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Invitation sent to <span className="font-medium text-foreground">{invite.invited_email}</span>. Accept to join this workspace, or decline to keep your account personal-only.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDeclineInvite(invite)}
                    disabled={declineInvite.isPending}
                  >
                    Decline Invite
                  </Button>
                  <Button
                    onClick={() => handleAcceptInvite(invite)}
                    disabled={acceptInvite.isPending}
                  >
                    {acceptInvite.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Joining Workspace...
                      </>
                    ) : (
                      'Accept Invite'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!selectedOrganization && justJoinedWorkspace && (
        <Card className="shadow-card border-emerald-500/20 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-emerald-500/10 via-background to-background">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl">You are now part of {justJoinedWorkspace.name}</CardTitle>
              {joinedRoleMeta && <Badge className={joinedRoleMeta.tone}>{joinedRoleMeta.label}</Badge>}
            </div>
            <CardDescription>
              Your workspace access has been activated. The company console will finish loading as your membership refreshes.
            </CardDescription>
          </CardHeader>
        </Card>
      )}


      {!selectedOrganization && isCompanyAccount && (
        <Card className="shadow-card border-primary/10 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-cyan-500/10 via-slate-500/5 to-transparent">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Company Workspace Setup
                </CardTitle>
                <Badge className={ROLE_BADGE.owner.tone}>
                  <Crown className="w-3.5 h-3.5 mr-1" />
                  Supa Admin
                </Badge>
              </div>
              <CardDescription className="max-w-2xl">
                This account was created as a company workspace account for <span className="font-medium text-foreground">{companyName}</span>.
                Finish setup to unlock the shared company dashboard, admin controls, and email-based teammate invites.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="rounded-xl border bg-muted/40 p-5 space-y-3">
              <p className="font-medium">What gets added</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>1. A dedicated company workspace connected to this account.</p>
                <p>2. Your role as <span className="font-medium text-foreground">Supa Admin</span>.</p>
                <p>3. A shared admin console where you can invite admins and members by the email they used to sign up.</p>
              </div>
            </div>
            <Button
              onClick={handleCreateWorkspace}
              disabled={createOrganization.isPending}
            >
              {createOrganization.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Workspace...
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 mr-2" />
                  Create Workspace
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {selectedOrganization && (
        <Card className="shadow-card border-primary/10 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-cyan-500/10 via-slate-500/5 to-transparent">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                {selectedOrganization.name}
              </CardTitle>
              {roleMeta && (
                <Badge className={roleMeta.tone}>
                  <RoleIcon className="w-3.5 h-3.5 mr-1" />
                  {roleMeta.label}
                </Badge>
              )}
            </div>
            <CardDescription className="max-w-2xl">
              Company workspace console. Everything in this view stays scoped to this workspace, which keeps the multi-tenant boundaries intact and makes it clear who belongs where.
            </CardDescription>
          </div>

          {organizations.length > 1 && (
            <div className="w-full lg:w-72 space-y-2">
              <Label htmlFor="workspace-selector">Active workspace</Label>
              <Select
                value={selectedOrganization.id}
                onValueChange={(value) => setSelectedOrgId(value)}
              >
                <SelectTrigger id="workspace-selector">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border p-4 bg-background">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</p>
            <p className="mt-2 text-3xl font-bold">{activeMembers.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">People actively inside this workspace</p>
          </div>
          <div className="rounded-xl border p-4 bg-background">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending Invites</p>
            <p className="mt-2 text-3xl font-bold">{pendingMemberInvites.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Email-based invites waiting to be accepted</p>
          </div>
          <div className="rounded-xl border p-4 bg-background">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace Domains</p>
            <p className="mt-2 text-3xl font-bold">{scopedDomains.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Domains monitored for this company</p>
          </div>
          <div className="rounded-xl border p-4 bg-background">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed Scans</p>
            <p className="mt-2 text-3xl font-bold">{completedScans.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Finished scans visible to this workspace</p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="admin" disabled={!canManageWorkspace}>Admin</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BadgeCheck className="w-4 h-4 text-primary" />
                  Workspace health snapshot
                </div>
                {justJoinedWorkspace && joinedRoleMeta && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">You are now part of {justJoinedWorkspace.name}</p>
                      <Badge className={joinedRoleMeta.tone}>{joinedRoleMeta.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Your membership is active and this overview now reflects your workspace access.</p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Latest score</p>
                    <p className="mt-1 text-2xl font-bold">{latestWorkspaceScan?.score ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Failed scans</p>
                    <p className="mt-1 text-2xl font-bold">{failedScans.length}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">High-risk phishing</p>
                    <p className="mt-1 text-2xl font-bold">{highRiskPhishing}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This workspace summary is scoped only to <span className="font-medium text-foreground">{selectedOrganization.name}</span>, so company admins can watch shared risk without seeing unrelated personal-account data.
                </p>
              </div>

              <div className="rounded-xl border p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Zap className="w-4 h-4 text-primary" />
                  Recommended admin actions
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>1. Keep company domains inside the shared workspace so scans stay visible to the right teammates.</p>
                  <p>2. Invite users with the exact email address they used to create their SecureWebOps account.</p>
                  <p>3. Use workspace-level phishing checks when the message affects a shared business workflow.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => navigate('/scans/new')}>
                    <Globe className="w-4 h-4 mr-2" />
                    Run Workspace Scan
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/phishing/check')}>
                    <Mail className="w-4 h-4 mr-2" />
                    Company Phishing Check
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            <div className="rounded-xl border p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Workspace people</h3>
                  <p className="text-sm text-muted-foreground">
                    Active members and pending email invites for {selectedOrganization.name}.
                  {!canManageWorkspace && " You can only view your own membership details."}
                  </p>
                </div>
                {membersLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search members by email..." 
                  className="pl-9 bg-white dark:bg-slate-950"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
              {canManageWorkspace && (
                <Button variant="outline" size="sm" onClick={handleExportMembers} className="w-full sm:w-auto shrink-0">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400" />
                  Export CSV
                </Button>
              )}
            </div>

              {!members?.length ? (
                <p className="text-sm text-muted-foreground">No members have been added to this workspace yet.</p>
            ) : filteredMembers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl dark:border-slate-800">
                <User className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No members found matching "{memberSearch}"</p>
                {memberSearch && (
                  <Button variant="link" onClick={() => setMemberSearch('')} className="mt-2">
                    Clear search
                  </Button>
                )}
              </div>
              ) : (
                <div className="space-y-3">
                {filteredMembers?.map((member) => {
                    const memberRole = ROLE_BADGE[member.role];
                    const MemberIcon = memberRole.icon;
                    const displayName = member.joined_at
                      ? member.invited_email || member.user_id || 'Workspace member'
                      : member.invited_email || 'Pending invite';
                    const isOwner = member.role === 'owner';
                    const isSelf = !!user?.id && member.user_id === user.id;
                    const canEditMember = canManageWorkspace && !isOwner;

                    return (
                      <div key={member.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <MemberIcon className="w-4 h-4 text-primary" />
                            <p className="font-medium break-all">{displayName}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {member.joined_at
                              ? `Joined ${new Date(member.joined_at).toLocaleDateString()}`
                              : `Invite sent ${member.invited_at ? new Date(member.invited_at).toLocaleDateString() : 'recently'}`}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Badge className={memberRole.tone}>{memberRole.label}</Badge>
                          {!member.joined_at && <Badge variant="outline">Pending</Badge>}
                          {canManageWorkspace && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <Select
                                value={member.role}
                                onValueChange={(value) => handleRoleChange(member, value as AppRole)}
                                disabled={!canEditMember || updateMemberRole.isPending}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="member">Member</SelectItem>
                                  {isOwner && <SelectItem value="owner">Supa Admin</SelectItem>}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveMember(member)}
                                disabled={removeMember.isPending || isOwner || isSelf}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {member.joined_at ? 'Remove' : 'Cancel Invite'}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="admin" className="space-y-4">
            <div className="rounded-xl border p-5 space-y-4">
              <div>
                <h3 className="font-semibold">Invite teammate</h3>
                <p className="text-sm text-muted-foreground">
                  Invite a user by the same email they used when creating their SecureWebOps account. If that account already exists, the invite will line up with it automatically.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.6fr_1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="workspace-invite-email">User email</Label>
                  <Input
                    id="workspace-invite-email"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-invite-role">Role</Label>
                  <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as AppRole)}>
                    <SelectTrigger id="workspace-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleInvite}
                    disabled={inviteMember.isPending || !inviteEmail.trim()}
                    className="w-full md:w-auto"
                  >
                    {inviteMember.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Send Invite
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How this works</p>
                <p>
                  Owners act as the workspace’s “supa admin,” admins can manage shared teammates, and members stay scoped to the workspace access their role allows. The invite is stored against the organization and can be accepted later by the matching account email.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
        </Card>
      )}
    </div>
  );
}
