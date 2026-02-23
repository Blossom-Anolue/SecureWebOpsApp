import { useState } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { OnlineIndicator } from './OnlineIndicator';
import { usePresence, type PresenceUser } from '@/hooks/usePresence';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface TeamPresenceProps {
  organizationId?: string;
  compact?: boolean;
}

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/scans': 'Scans',
  '/scans/new': 'New Scan',
  '/phishing': 'Phishing',
  '/phishing/check': 'Phishing Check',
  '/phishing/history': 'History',
  '/training': 'Training',
  '/team': 'Team',
  '/activity': 'Activity',
  '/settings': 'Settings',
};

function getPageName(path?: string): string {
  if (!path) return 'Unknown';
  
  // Check exact match first
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  
  // Check for scan detail pages
  if (path.startsWith('/scans/') && path !== '/scans/new') {
    return 'Viewing Scan';
  }
  
  return 'Browsing';
}

function getInitials(email: string): string {
  const name = email.split('@')[0];
  return name.substring(0, 2).toUpperCase();
}

export function TeamPresence({ organizationId, compact = false }: TeamPresenceProps) {
  const { onlineUsers, isConnected } = usePresence(organizationId);
  const [isOpen, setIsOpen] = useState(true);

  if (!isConnected) return null;

  const onlineCount = onlineUsers.length;

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <OnlineIndicator size="sm" />
        <span className="text-xs text-sidebar-foreground/60">
          {onlineCount} teammate{onlineCount !== 1 ? 's' : ''} online
        </span>
        {onlineCount > 0 && (
          <div className="flex -space-x-2 ml-auto">
            {onlineUsers.slice(0, 3).map((user) => (
              <div
                key={user.id}
                className="w-6 h-6 rounded-full bg-sidebar-primary/20 border border-sidebar-border flex items-center justify-center text-[10px] font-medium text-sidebar-primary"
                title={`${user.email} - ${getPageName(user.current_page)}`}
              >
                {getInitials(user.email)}
              </div>
            ))}
            {onlineCount > 3 && (
              <div className="w-6 h-6 rounded-full bg-sidebar-accent flex items-center justify-center text-[10px] font-medium text-sidebar-foreground">
                +{onlineCount - 3}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between px-4 py-2 hover:bg-sidebar-accent/30 transition-colors">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sidebar-foreground/60" />
            <span className="text-sm font-medium text-sidebar-foreground">
              Team ({onlineCount} online)
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-sidebar-foreground/60" />
          ) : (
            <ChevronDown className="w-4 h-4 text-sidebar-foreground/60" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-2 space-y-1">
          {onlineCount === 0 ? (
            <p className="text-xs text-sidebar-foreground/50 py-2">
              No teammates online right now
            </p>
          ) : (
            onlineUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-sidebar-accent/20"
              >
                <div className="relative">
                  <div className="w-7 h-7 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs font-medium text-sidebar-primary">
                    {getInitials(user.email)}
                  </div>
                  <OnlineIndicator 
                    size="sm" 
                    className="absolute -bottom-0.5 -right-0.5 ring-2 ring-sidebar"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-sidebar-foreground truncate">
                    {user.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">
                    {getPageName(user.current_page)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
