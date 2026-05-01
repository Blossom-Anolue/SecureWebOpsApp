import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only set up listeners if the user is currently logged in
    if (!user) return;

    // 1. Listen for new File Shares
    const fileSharesChannel = supabase
      .channel('realtime-file-shares')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'file_permissions',
          filter: `user_id=eq.${user.id}`, // Only listen to shares meant for THIS user
        },
        (payload) => {
          // Trigger a popup notification on the recipient's screen
          toast({
            title: "New File Shared 📁",
            description: "A team member just securely shared a file with you.",
          });
          // Tell React Query to refresh the file list so it appears immediately
          queryClient.invalidateQueries({ queryKey: ['files'] });
        }
      )
      .subscribe();

    // 2. Listen for Workspace Invites
    const invitesChannel = supabase
      .channel('realtime-team-invites')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'organization_members',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          toast({
            title: "New Team Invite 🤝",
            description: "You've been invited to join a new workspace.",
          });
          queryClient.invalidateQueries({ queryKey: ['pending_invites'] });
        }
      )
      .subscribe();

    // Cleanup function when component unmounts (e.g. user logs out)
    return () => {
      supabase.removeChannel(fileSharesChannel);
      supabase.removeChannel(invitesChannel);
    };
  }, [user, toast, queryClient]);
}