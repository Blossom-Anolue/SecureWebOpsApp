/**
 * @fileoverview Authentication Context Provider
 * 
 * This file provides a React Context for managing user authentication state
 * throughout the application. It wraps Supabase Auth and provides a clean
 * interface for components to access auth state and functions.
 * 
 * Features:
 * - Tracks current user and session
 * - Provides sign in, sign up, and sign out functions
 * - Automatically syncs with Supabase auth state changes
 * - Loading state while auth is being determined
 * 
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Shape of the authentication context value.
 * All components within the AuthProvider can access these values and functions.
 */
interface AuthContextType {
  /** The currently authenticated user, or null if not logged in */
  user: User | null;
  /** The current session containing tokens, or null if not logged in */
  session: Session | null;
  /** The user's extended profile data */
  profile: any | null;
  /** Whether auth state is still being loaded */
  loading: boolean;
  
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, metadata?: any) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any } | void>;
  
  signInWithMagicLink: (email: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  verifyOTP: (email: string, token: string) => Promise<{ error: any }>;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

/**
 * The Authentication Context.
 * Initially undefined - must be used within an AuthProvider.
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

/**
 * Authentication Provider Component.
 * 
 * Wraps the application and provides authentication state to all children.
 * Must be placed near the root of the component tree, but inside any
 * necessary providers like QueryClientProvider.
 * 
 * @param props.children - Child components that will have access to auth context
 * 
 * @example
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <Router>
 *         <Routes />
 *       </Router>
 *     </AuthProvider>
 *   );
 * }
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  /** Current authenticated user */
  const [user, setUser] = useState<User | null>(null);
  /** Current session with auth tokens */
  const [session, setSession] = useState<Session | null>(null);
  /** Extended user profile */
  const [profile, setProfile] = useState<any | null>(null);
  /** Loading state - true until initial auth check completes */
  const [loading, setLoading] = useState(true);

  /**
   * Set up authentication state management on mount.
   * 
   * IMPORTANT: The auth state listener is set up FIRST, then we check
   * for an existing session. This prevents race conditions where the
   * session check might complete before the listener is ready.
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Safely handle both Supabase v1 and v2 getSession methods
        const authSession = supabase.auth.getSession 
          ? (await supabase.auth.getSession()).data.session 
          : (supabase.auth as any).session();

        if (mounted) {
          setSession(authSession ?? null);
          setUser(authSession?.user ?? null);
          if (authSession?.user) await fetchProfile(authSession.user.id);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    // Remove deep destructuring to avoid crashes if subscription is missing
    const { data } = supabase.auth.onAuthStateChange(async (_event, authSession) => {
      if (!mounted) return;
      try {
        setSession(authSession ?? null);
        setUser(authSession?.user ?? null);
        if (authSession?.user) {
          await fetchProfile(authSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      // Safely cleanup for both v1 and v2 clients to prevent Strict Mode crashes
      if (data?.subscription) {
        data.subscription.unsubscribe();
      } else if ((data as any)?.unsubscribe) {
        (data as any).unsubscribe();
      }
    };
  }, []);

  // Force logout on page close/unload to prevent session restoration
  useEffect(() => {
    const handleUnload = () => {
      // Sign out synchronously when the page unloads
      supabase.auth.signOut();
    };
    
    window.addEventListener('unload', handleUnload);
    return () => {
      window.removeEventListener('unload', handleUnload);
    };
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  }

  const signIn = (email: string, password: string) => 
    supabase.auth.signInWithPassword({ email, password });

  const signUp = (email: string, password: string, metadata?: any) => 
    supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata?.fullName,
          username: metadata?.username,
          company_name: metadata?.companyName,
          job_role: metadata?.jobRole,
        },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      }
    });

  const signInWithMagicLink = (email: string) => 
    supabase.auth.signInWithOtp({ 
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      }
    });

  const verifyOTP = (email: string, token: string) =>
    supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

  const resetPassword = (email: string) => 
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign out error:", error.message);
    
    // Force clear local state in case the auth listener misses it (e.g., if session was already expired)
    setUser(null);
    setSession(null);
    setProfile(null);
    return { error };
  };

  return (
    <AuthContext.Provider 
      value={{ user, session, profile, loading, signIn, signUp, signOut, signInWithMagicLink, resetPassword, verifyOTP }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Custom hook for accessing authentication context.
 * 
 * Must be used within an AuthProvider. Throws an error if used outside.
 * 
 * @returns The authentication context value
 * @throws Error if used outside of AuthProvider
 * 
 * @example
 * function ProfileButton() {
 *   const { user, signOut } = useAuth();
 *   
 *   if (!user) return <Link to="/auth">Sign In</Link>;
 *   
 *   return (
 *     <button onClick={signOut}>
 *       Sign Out ({user.email})
 *     </button>
 *   );
 * }
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
