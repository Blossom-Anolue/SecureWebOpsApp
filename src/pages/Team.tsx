import { useState } from 'react';
import { Users, Plus, Shield, UserPlus, Trash2, Loader2, Building2, Crown, ShieldCheck, User, Eye, MailCheck, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { LoadingState } from '@/components/common/LoadingState';
import { EmptyState } from '@/components/common/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityLogger } from '@/hooks/useActivityLog';
import {
  useOrganizations,
  useOrganizationMembers,
  usePendingInvites,
  useCreateOrganization,
  useInviteMember,
  useAcceptInvite,
  useDeclineInvite,
  useUpdateMemberRole,
  useRemoveMember,
  useCurrentUserRole,
  type AppRole,
  type OrganizationMember,
} from '@/hooks/useOrganizations';

const ROLE_CONFIG: Record<AppRole, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-warning' },
  admin: { label: 'Admin', icon: ShieldCheck, color: 'text-primary' },
  member: { label: 'Member', icon: User, color: 'text-foreground' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-muted-foreground' },
};

export default function Team() {
  const { user } = useAuth();
  const { log } = useActivityLogger();
  const { data: organizations, isLoading: orgsLoading } = useOrganizations();
  const { data: pendingInvites, isLoading: invitesLoading } = usePendingInvites();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  
  const selectedOrg = organizations?.find(o => o.id === selectedOrgId) || organizations?.[0];
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(selectedOrg?.id);
  const { data: currentUserRole } = useCurrentUserRole(selectedOrg?.id);
  
  const createOrg = useCreateOrganization();
  const inviteMember = useInviteMember();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('member');

  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleAcceptInvite = async (member: OrganizationMember) => {
    try {
      await acceptInvite.mutateAsync({
        membershipId: member.id,
        organizationId: member.organization_id,
      });

      log('member.joined', 'member', {
        resourceId: member.id,
        organizationId: member.organization_id,
        details: { email: user?.email, role: member.role },
      });

      setSelectedOrgId(member.organization_id);
      toast({
        title: 'Invitation accepted',
        description: `You joined ${member.organizations?.name || 'the team'}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to accept invitation.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleDeclineInvite = async (member: OrganizationMember) => {
    try {
      await declineInvite.mutateAsync({
        membershipId: member.id,
        organizationId: member.organization_id,
      });

      toast({
        title: 'Invitation declined',
        description: `Removed invite to ${member.organizations?.name || 'the team'}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to decline invitation.',
        variant: 'destructive',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    
    const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    try {
      const org = await createOrg.mutateAsync({ name: newOrgName, slug });
      setSelectedOrgId(org.id);
      setNewOrgName('');
      setIsCreateOrgOpen(false);
      
      log('team.created', 'organization', {
        resourceId: org.id,
        organizationId: org.id,
        details: { name: newOrgName },
      });
      
      toast({
        title: "Team created",
        description: `${newOrgName} has been created successfully.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message?.includes('unique') 
          ? "A team with this name already exists."
          : "Failed to create team.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedOrg) return;
    
    try {
      await inviteMember.mutateAsync({
        organizationId: selectedOrg.id,
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail('');
      setIsInviteOpen(false);
      
      log('member.invited', 'member', {
        organizationId: selectedOrg.id,
        details: { email: inviteEmail, role: inviteRole },
      });
      
      toast({
        title: "Invitation sent",
        description: `Invited ${inviteEmail} as ${ROLE_CONFIG[inviteRole].label}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message?.includes('unique')
          ? "This user is already a member."
          : "Failed to send invitation.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleRoleChange = async (member: OrganizationMember, newRole: AppRole) => {
    if (!selectedOrg) return;
    
    try {
      await updateRole.mutateAsync({
        memberId: member.id,
        organizationId: selectedOrg.id,
        role: newRole,
      });
      
      log('member.role_changed', 'member', {
        resourceId: member.id,
        organizationId: selectedOrg.id,
        details: { role: newRole },
      });
      
      toast({
        title: "Role updated",
        description: `Updated role to ${ROLE_CONFIG[newRole].label}.`,
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update role.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  const handleRemoveMember = async (member: OrganizationMember) => {
    if (!selectedOrg) return;
    
    try {
      await removeMember.mutateAsync({
        memberId: member.id,
        organizationId: selectedOrg.id,
      });
      
      log('member.removed', 'member', {
        resourceId: member.id,
        organizationId: selectedOrg.id,
      });
      
      toast({
        title: "Member removed",
        description: "The team member has been removed.",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove member.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    }
  };

  if (orgsLoading) {
    return <LoadingState message="Loading teams..." />;
  }

  if ((!organizations || organizations.length === 0) && (!pendingInvites || pendingInvites.length === 0) && !invitesLoading) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Team Management</h1>
          <p className="text-muted-foreground mt-1">Collaborate with your team on security</p>
        </div>
        
        <EmptyState
          icon={Users}
          title="No teams yet"
          description="Create a team to collaborate with others on your security monitoring."
          actionLabel="Create Team"
          onAction={() => setIsCreateOrgOpen(true)}
        />

        <Dialog open={isCreateOrgOpen} onOpenChange={setIsCreateOrgOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a Team</DialogTitle>
              <DialogDescription>
                Create a team to collaborate with others on security monitoring.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Team Name</Label>
                <Input
                  id="org-name"
                  placeholder="My Company"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOrgOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrg} disabled={createOrg.isPending}>
                {createOrg.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Team'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display">Team Management</h1>
          <p className="text-muted-foreground mt-1">Manage your team and access permissions</p>
        </div>
        <Dialog open={isCreateOrgOpen} onOpenChange={setIsCreateOrgOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a Team</DialogTitle>
              <DialogDescription>
                Create a new team to collaborate with others.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-org-name">Team Name</Label>
                <Input
                  id="new-org-name"
                  placeholder="My Company"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOrgOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateOrg} disabled={createOrg.isPending}>
                {createOrg.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Team'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!!pendingInvites?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MailCheck className="w-5 h-5" />
              Your Invitations
            </CardTitle>
            <CardDescription>
              Join a company workspace with one click. This is how personal accounts move into a team without losing the shared multitenant setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{invite.organizations?.name || 'Company workspace'}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_CONFIG[invite.role].label}
                    </Badge>
                    <span>Invited as {invite.invited_email}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sent {invite.invited_at ? new Date(invite.invited_at).toLocaleString() : 'recently'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDeclineInvite(invite)}
                    disabled={declineInvite.isPending}
                  >
                    Decline
                  </Button>
                  <Button
                    onClick={() => handleAcceptInvite(invite)}
                    disabled={acceptInvite.isPending}
                  >
                    {acceptInvite.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Joining...
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

      {/* Team Selector */}
      {!!organizations?.length && organizations.length > 1 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              <Select
                value={selectedOrg?.id}
                onValueChange={(id) => setSelectedOrgId(id)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Info */}
      {!!selectedOrg && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                {selectedOrg?.name}
              </CardTitle>
              <CardDescription>
                {members?.length || 0} team member{members?.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            {canManageMembers && (
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Team Member</DialogTitle>
                    <DialogDescription>
                      Invite someone to join your team.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin - Can manage team</SelectItem>
                          <SelectItem value="member">Member - Full access</SelectItem>
                          <SelectItem value="viewer">Viewer - View only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={inviteMember.isPending}>
                      {inviteMember.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Invite'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {members?.map((member) => {
                const RoleIcon = ROLE_CONFIG[member.role].icon;
                const isCurrentUser = member.user_id === user?.id;
                const isPending = !member.joined_at;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <RoleIcon className={`w-5 h-5 ${ROLE_CONFIG[member.role].color}`} />
                      </div>
                      <div>
                        <p className="font-medium">
                          {isPending 
                            ? member.invited_email 
                            : member.invited_email || `User ${member.user_id?.slice(0, 8) || 'member'}`
                          }
                          {isCurrentUser && (
                            <span className="text-xs text-muted-foreground ml-2">(you)</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {ROLE_CONFIG[member.role].label}
                          </Badge>
                          {isPending && (
                            <Badge variant="outline" className="text-xs">
                              Pending
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {canManageMembers && !isCurrentUser && member.role !== 'owner' && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(role) => handleRoleChange(member, role as AppRole)}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(ROLE_CONFIG).map(([role, config]) => {
              const Icon = config.icon;
              return (
                <div key={role} className="p-3 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="font-medium">{config.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {role === 'owner' && 'Full control including team deletion'}
                    {role === 'admin' && 'Manage team members, company domains, and view company-wide scans'}
                    {role === 'member' && 'Run scans, join company workspaces, and view only your own scan results'}
                    {role === 'viewer' && 'Read-only access to company-wide scans and reports'}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {!selectedOrg && !pendingInvites?.length && (
        <Card>
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <Inbox className="w-10 h-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No team selected yet</p>
                <p className="text-sm text-muted-foreground">
                  Create a company workspace or accept an invitation to collaborate under one shared multitenant environment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
