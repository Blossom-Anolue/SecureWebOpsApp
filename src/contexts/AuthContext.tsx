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

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  /** Whether auth state is still being loaded */
  loading: boolean;
  /** Function to sign in with email and password */
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Function to create a new account */
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Function to sign out the current user */
  signOut: () => Promise<void>;
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
    // Step 1: Set up auth state listener FIRST
    // This will fire whenever auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Step 2: THEN check for existing session
    // This handles the case where user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Cleanup: Unsubscribe from auth state changes
    return () => subscription.unsubscribe();
  }, []);

  /**
   * Signs in a user with email and password.
   * 
   * @param email - User's email address
   * @param password - User's password
   * @returns Object with error property (null if successful)
   */
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  /**
   * Creates a new user account with email and password.
   * 
   * Note: Email confirmation is auto-confirmed in development.
   * In production, users would need to verify their email.
   * 
   * @param email - User's email address
   * @param password - User's password (min 6 characters)
   * @returns Object with error property (null if successful)
   */
  const signUp = async (email: string, password: string) => {
    // Configure redirect URL for email confirmation
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error };
  };

  /**
   * Signs out the current user.
   * Clears all local auth state and invalidates the session.
   */
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Provide auth state and functions to children
  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
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
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
