import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePresence } from '@/hooks/usePresence';
import { useOrganizations } from '@/hooks/useOrganizations';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsDialog } from '@/components/shortcuts/KeyboardShortcutsDialog';
import { CommandPalette } from '@/components/shortcuts/CommandPalette';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const location = useLocation();
  const { data: organizations } = useOrganizations();
  const primaryOrg = organizations?.[0];
  const { updatePresence } = usePresence(primaryOrg?.id);
  
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // Update presence when route changes
  useEffect(() => {
    updatePresence(location.pathname);
  }, [location.pathname, updatePresence]);

  // Global ? shortcut to open help
  useEffect(() => {
    const handleHelp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', handleHelp);
    return () => window.removeEventListener('keydown', handleHelp);
  }, []);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar onCommandOpen={() => setCommandOpen(true)} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div 
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72">
            <Sidebar onClose={() => setSidebarOpen(false)} onCommandOpen={() => setCommandOpen(true)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-background border-b px-4 h-14 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">CS</span>
            </div>
            <span className="font-display font-semibold">SecureWebOps</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCommandOpen(true)}
              title="Command palette (⌘K)"
            >
              <Search className="h-4 w-4" />
            </Button>
            <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            <ThemeToggle />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="container py-6 lg:py-8">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <MobileNav />
      </div>
    </div>
  );
}
