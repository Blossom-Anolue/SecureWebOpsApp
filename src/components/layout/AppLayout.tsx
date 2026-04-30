import { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Menu, Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePresence } from '@/hooks/usePresence';
import { useOrganizations } from '@/hooks/useOrganizations';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsDialog } from '@/components/shortcuts/KeyboardShortcutsDialog';
import { CommandPalette } from '@/components/shortcuts/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { FeedbackModal } from '@/components/common/FeedbackModal';
import { SupportModal } from '@/components/common/SupportModal';
import { useToast } from '@/hooks/use-toast';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const location = useLocation();
  const { data: organizations } = useOrganizations();
  const primaryOrg = organizations?.[0];
  const { updatePresence } = usePresence(primaryOrg?.id);
  const { isAwaitingPasswordReset, signOut } = useAuth();
  const { toast } = useToast();
  
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

  // Idle Session Timeout (15 minutes)
  useEffect(() => {
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();

    const handleIdleLogout = async () => {
      await signOut();
      toast({
        title: "Session Expired",
        description: "You have been logged out due to inactivity for your security.",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
    };

    const handleActivity = () => {
      const now = Date.now();
      // Throttle timer resets to at most once per second for performance
      if (now - lastActivity > 1000) {
        lastActivity = now;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(handleIdleLogout, IDLE_TIMEOUT_MS);
      }
    };

    timeoutId = setTimeout(handleIdleLogout, IDLE_TIMEOUT_MS);
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => document.removeEventListener(e, handleActivity));
    };
  }, [signOut, toast]);

  if (isAwaitingPasswordReset && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />;
  }

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      
      {/* Feedback/Support Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        featureContext="general_app_feedback"
      />
      <SupportModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
      />

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar onCommandOpen={() => setCommandOpen(true)} onHelpOpen={() => setSupportModalOpen(true)} onFeedbackOpen={() => setFeedbackModalOpen(true)} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div 
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72">
            <Sidebar onClose={() => setSidebarOpen(false)} onCommandOpen={() => setCommandOpen(true)} onHelpOpen={() => setSupportModalOpen(true)} onFeedbackOpen={() => setFeedbackModalOpen(true)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
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
          <div className="flex items-center gap-2 group cursor-default">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-primary/90 to-cyan-600 flex items-center justify-center shadow-md shadow-primary/20 border border-white/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-white/10 w-full h-full transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
              <Shield className="w-4 h-4 text-white drop-shadow-md relative z-10" />
            </div>
            <span className="font-display font-bold tracking-tight">SecureWebOps</span>
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
        <main className="flex-1 overflow-y-auto">
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
