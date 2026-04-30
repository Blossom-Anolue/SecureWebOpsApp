import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Shield, Mail, Settings, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganizations, usePendingInvites } from '@/hooks/useOrganizations';
import { useProfile } from '@/hooks/useSecurityData';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/scans', icon: Shield, label: 'Scans' },
  { to: '/phishing', icon: Mail, label: 'Phishing' },
  { to: '/encrypt', icon: Lock, label: 'Vault' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function MobileNav() {
  const { data: profile } = useProfile();
  const { data: organizations } = useOrganizations();
  const { data: pendingInvites } = usePendingInvites();
  const showWorkspaceAdmin = Boolean(
    profile?.company_name?.trim() || organizations?.length || pendingInvites?.length
  );

  const items = showWorkspaceAdmin
    ? [...navItems.slice(0, 4), { to: '/workspace-admin', icon: Unlock, label: 'Admin' }, navItems[4]]
    : navItems;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-30">
      <ul className="flex justify-around items-center h-16 px-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

