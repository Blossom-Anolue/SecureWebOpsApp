import { Building2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import Greeting from '@/components/Greeting';
import { WorkspaceAdminPanel } from '@/components/dashboard/WorkspaceAdminPanel';
import { toast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import { useDomains, usePhishingChecks, useProfile, useScans } from '@/hooks/useSecurityData';
import { useOrganizations, usePendingInvites } from '@/hooks/useOrganizations';

export default function WorkspaceAdmin() {
  const { data: domains, isLoading: domainsLoading } = useDomains();
  const { data: scans, isLoading: scansLoading } = useScans();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: organizations, isLoading: organizationsLoading } = useOrganizations();
  const { data: pendingInvites, isLoading: invitesLoading } = usePendingInvites();
  usePhishingChecks();

  const isLoading =
    domainsLoading ||
    scansLoading ||
    profileLoading ||
    organizationsLoading ||
    invitesLoading;

  const companyName = profile?.company_name?.trim() || '';
  const hasCompanyAccess = Boolean(companyName || organizations?.length || pendingInvites?.length);
  const hasShownInviteNotice = useRef(false);

  useEffect(() => {
    if (!pendingInvites?.length) {
      hasShownInviteNotice.current = false;
      return;
    }

    if (hasShownInviteNotice.current) return;

    const workspaceNames = pendingInvites
      .map((invite) => invite.organizations?.name || 'a company workspace')
      .slice(0, 2)
      .join(', ');

    toast({
      title: pendingInvites.length === 1 ? 'Workspace invite received' : 'Workspace invites received',
      description: pendingInvites.length === 1
        ? `You have been invited to ${workspaceNames}. Review the invitation below to accept or decline it.`
        : `You have been invited to ${workspaceNames}${pendingInvites.length > 2 ? ' and more' : ''}. Review your invitations below to accept or decline them.`,
      className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
    });

    hasShownInviteNotice.current = true;
  }, [pendingInvites]);

  if (isLoading) {
    return <LoadingState message="Loading company workspace console..." />;
  }

  if (!hasCompanyAccess) {
    return (
      <div className="space-y-6 pb-20 lg:pb-0">
        <div className="space-y-1">
          <Greeting />
        </div>
        <EmptyState
          icon={Building2}
          title="Company is only for workspace accounts"
          description="Personal accounts do not get the multi-tenant admin console. Sign up with a company name or accept a company workspace invite to unlock Supa Admin and Admin tools."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="space-y-1">
        <Greeting />
        <p className="text-muted-foreground">
          Manage your company workspace, review invites, assign admins, and keep teammate access scoped correctly.
        </p>
      </div>

      <WorkspaceAdminPanel domains={domains || []} scans={scans || []} />
    </div>
  );
}
