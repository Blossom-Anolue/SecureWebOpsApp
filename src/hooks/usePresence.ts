/**
 * @fileoverview Real-time Presence Hook
 * 
 * This hook manages real-time user presence using Supabase Realtime.
 * It allows team members to see who else is currently online and
 * what page they're viewing.
 * 
 * Features:
 * - Track online users in real-time
 * - Show what page each user is viewing
 * - Automatic cleanup on disconnect
 * 
 * @module hooks/usePresence
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Represents a user's presence information.
 * Contains data about who they are and their current activity.
 */
export interface PresenceUser {
  /** Unique identifier of the user */
  id: string;
  /** User's email address for display */
  email: string;
  /** Timestamp when the user came online */
  online_at: string;
  /** The page/route the user is currently viewing */
  current_page?: string;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for managing real-time presence awareness.
 * 
 * Sets up a Supabase Realtime channel for presence tracking.
 * The channel is scoped to either an organization (for team awareness)
 * or to the individual user (for personal sessions).
 * 
 * @param organizationId - Optional org ID to track presence within a team
 * @returns Object containing online users, update function, and connection status
 * 
 * @example
 * // Track presence within a team
 * const { onlineUsers, updatePresence, isConnected } = usePresence('org-uuid');
 * 
 * // Update current page when navigating
 * useEffect(() => {
 *   updatePresence('/dashboard');
 * }, [location.pathname]);
 */
export function usePresence(organizationId?: string) {
  const { user } = useAuth();
  
  /** List of other users currently online */
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  
  /** Reference to the Realtime channel */
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  /**
   * Updates the current user's presence information.
   * Call this when the user navigates to a new page.
   * 
   * @param currentPage - The current route/page path
   */
  const updatePresence = useCallback(async (currentPage?: string) => {
    if (!channel || !user) return;

    // Send updated presence data to all subscribers
    await channel.track({
      id: user.id,
      email: user.email,
      online_at: new Date().toISOString(),
      current_page: currentPage,
    });
  }, [channel, user]);

  /**
   * Set up the presence channel on mount and clean up on unmount.
   */
  useEffect(() => {
    if (!user) return;

    // Create a unique channel name based on context
    // Organization channels allow team members to see each other
    // User channels are for tracking individual sessions
    const channelName = organizationId 
      ? `presence:org:${organizationId}` 
      : `presence:user:${user.id}`;

    console.log('Setting up presence channel:', channelName);

    // Create the presence channel with the current user's ID as the key
    const presenceChannel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    // Set up presence event handlers
    presenceChannel
      // Handle presence sync - called when we receive the current state
      .on('presence', { event: 'sync' }, () => {
        // Get the current presence state for all users
        const state = presenceChannel.presenceState();
        console.log('Presence sync:', state);
        
        // Build the list of online users (excluding current user)
        const users: PresenceUser[] = [];
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            // Don't include current user in the list
            if (presence.id !== user.id) {
              users.push({
                id: presence.id,
                email: presence.email,
                online_at: presence.online_at,
                current_page: presence.current_page,
              });
            }
          });
        });
        setOnlineUsers(users);
      })
      // Handle when a user joins
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      // Handle when a user leaves
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      // Subscribe to the channel and announce our presence
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Presence channel subscribed');
          // Announce our presence with initial data
          await presenceChannel.track({
            id: user.id,
            email: user.email,
            online_at: new Date().toISOString(),
            current_page: window.location.pathname,
          });
        }
      });

    // Store channel reference for updates
    setChannel(presenceChannel);

    // Cleanup: Remove channel subscription on unmount
    return () => {
      console.log('Cleaning up presence channel');
      supabase.removeChannel(presenceChannel);
    };
  }, [user, organizationId]);

  return { 
    /** Array of other users currently online */
    onlineUsers, 
    /** Function to update current user's presence */
    updatePresence,
    /** Whether the presence channel is connected */
    isConnected: !!channel,
  };
}
