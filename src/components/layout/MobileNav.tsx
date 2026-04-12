import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Shield, Mail, Users, Settings, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { usePendingInvites } from '@/hooks/useOrganizations';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/scans', icon: Shield, label: 'Scans' },
  { to: '/phishing', icon: Mail, label: 'Phishing' },
  { to: '/encrypt', icon: Lock, label: 'Vault' },
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function MobileNav() {
  const { data: pendingInvites } = usePendingInvites();
  const pendingInviteCount = pendingInvites?.length ?? 0;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-30">
      <ul className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => (
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
              <span className="relative">
                <item.icon className="w-5 h-5" />
                {item.to === '/team' && pendingInviteCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-3 -top-2 h-5 min-w-5 px-1.5 text-[10px]"
                  >
                    {pendingInviteCount}
                  </Badge>
                )}
              </span>
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
