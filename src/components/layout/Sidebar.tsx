import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Shield, 
  Mail, 
  GraduationCap, 
  Settings,
  Users,
  Activity,
  X,
  HelpCircle,
  LogOut,
  Search,
  Lock
} from 'lucide-react';
import { KeyboardShortcutsDialog } from '@/components/shortcuts/KeyboardShortcutsDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { TeamPresence } from '@/components/presence/TeamPresence';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useOrganizations } from '@/hooks/useOrganizations';

interface SidebarProps {
  onClose?: () => void;
  onCommandOpen?: () => void;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scans', icon: Shield, label: 'Website Scans' },
  { to: '/phishing', icon: Mail, label: 'Phishing Check' },
  { to: '/encrypt', icon: Lock, label: 'PDF Secure Vault' }, 
  { to: '/training', icon: GraduationCap, label: 'Training' },
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/activity', icon: Activity, label: 'Activity Log' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar({ onClose, onCommandOpen }: SidebarProps) {
  const { signOut, user } = useAuth();
  const { data: organizations } = useOrganizations();
  const primaryOrg = organizations?.[0];

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <aside className="w-72 h-screen bg-sidebar text-sidebar-foreground flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-sidebar-primary-foreground">SecureWebOps</h1>
            <p className="text-xs text-sidebar-foreground/60">Security Assistant</p>
          </div>
        </div>
        {onClose && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Search Button */}
      <div className="px-3 pb-2">
        <Button
          variant="outline"
          className="w-full justify-start text-sidebar-foreground/60 bg-sidebar-accent/30 border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          onClick={onCommandOpen}
        >
          <Search className="w-4 h-4 mr-2" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/60">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Team Presence */}
      {primaryOrg && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <TeamPresence organizationId={primaryOrg.id} />
        </div>
      )}

      {/* User Section */}
      <div className="p-3 border-t border-sidebar-border">
        {user && (
          <div className="flex items-center justify-between px-4 py-2 mb-2">
            <p className="text-xs text-sidebar-foreground/60 truncate flex-1">{user.email}</p>
            <div className="flex items-center gap-1">
              <KeyboardShortcutsDialog />
              <ThemeToggle />
            </div>
          </div>
        )}
        <Button 
          variant="ghost" 
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Help Section */}
      <div className="p-4 mx-3 mb-4 rounded-lg bg-sidebar-accent/30">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-sidebar-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-sidebar-accent-foreground">Need help?</p>
            <p className="text-xs text-sidebar-foreground/60 mt-1">
              Check our guides or contact support
            </p>
            <Button 
              variant="link" 
              className="h-auto p-0 text-xs text-sidebar-primary mt-2"
            >
              View Help Center
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
