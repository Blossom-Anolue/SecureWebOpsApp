/**
 * @fileoverview Authentication Page
 * 
 * This page handles user sign in and sign up flows.
 * It uses a tabbed interface to switch between modes.
 * 
 * Features:
 * - Email/password sign in
 * - Email/password sign up
 * - Form validation with Zod
 * - Error handling with toast notifications
 * - Automatic redirect if already logged in
 * 
 * @module pages/Auth
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Mail, Lock, Loader2, Building2, UserRound, CheckCircle2, XCircle, MailCheck, Briefcase, Eye, EyeOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { z } from 'zod';

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Zod schema for validating authentication form inputs.
 * - Email must be a valid email format
 * - Password must be at least 6 characters
 */
const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signUpSchema = authSchema.extend({
  fullName: z.string().trim().min(2, 'Please enter your name'),
  companyName: z.string().trim().optional(),
  username: z.string().trim().min(3, 'Username must be at least 3 characters'),
  jobRole: z.string().trim().optional(),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Authentication page component.
 *
 * Provides sign in and sign up forms with validation.
 * Redirects to dashboard if user is already authenticated.
 *
 * @returns The rendered authentication page
 */
export default function Auth() {
  const navigate = useNavigate();
  const { user, loading, signIn, signUp, signInWithMagicLink, resetPassword } = useAuth();
  
  // Form state
  const [activeTab, setActiveTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [accountType, setAccountType] = useState<'personal' | 'company' | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [showMagicLinkSent, setShowMagicLinkSent] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [timer, setTimer] = useState(0);

  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const beginPasswordPeek = (setter: (value: boolean) => void) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setter(true);
  };

  const endPasswordPeek = (setter: (value: boolean) => void) => () => {
    setter(false);
  };

  /**
   * Redirect to dashboard if user is already logged in.
   * This prevents showing the auth page to authenticated users.
   */
  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  useEffect(() => {
    const checkUsername = async () => {
      const usernameValue = username.trim().toLowerCase();
      if (usernameValue.length < 3) return setIsUsernameAvailable(null);
      
      setIsValidating(true);
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('username')
          .eq('username', usernameValue)
          .maybeSingle();
        
        if (error) throw error;
        setIsUsernameAvailable(!data);
      } catch (err) {
        console.error("Username check error:", err);
        setIsUsernameAvailable(null); 
      } finally {
        setIsValidating(false);
      }
    };

    const debounceTimer = setTimeout(checkUsername, 500);
    return () => clearTimeout(debounceTimer);
  }, [username]);

  /**
   * Validates form inputs using the Zod schema.
   * Sets field-specific error messages for display.
   *
   * @returns true if valid, false otherwise
   */
  const validateForm = (mode: 'signin' | 'signup') => {
    try {
      if (mode === 'signup') {
        // Validate account type selection
        if (!accountType) {
          setErrors(prev => ({ ...prev, accountType: "Please select an account type." }));
          return false;
        }
        // If company account, companyName is required
        if (accountType === 'company' && !companyName.trim()) {
          setErrors(prev => ({ ...prev, companyName: "Company name is required for a company workspace." }));
          return false;
        }
        signUpSchema.parse({ email, password, confirmPassword, fullName, companyName, username, jobRole }); // companyName and jobRole are optional in schema
      } else {
        authSchema.parse({ email, password });
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          fieldErrors[err.path[0] as string] = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleRequestOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return toast({ title: "Email Required", description: "Please enter your email first.", variant: "destructive" });

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      }
    });
    setIsSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } 
    else {
      setEmail(normalizedEmail);
      setShowMagicLinkSent(true);
      setTimer(60);
      toast({ title: "Link Sent", description: "Check your email and click the secure sign-in link.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' }); 
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsSubmitting(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Email Sent", description: "Check your inbox for the reset link." });
      setIsResetting(false);
    }
  };

  /**
   * Handles the sign in form submission.
   * Validates inputs, attempts sign in, and shows appropriate feedback.
   */
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm('signin')) return;

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      // Handle specific error cases with user-friendly messages
      if (error.message.includes('Invalid login credentials')) {
        toast({
          title: 'Login failed',
          description: 'Invalid email or password. Please try again.',
          variant: 'destructive',
          className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
          className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
        });
      }
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
      });
      navigate('/dashboard');
    }
  };

  /**
   * Handles the sign up form submission.
   * Validates inputs, creates account, and shows appropriate feedback.
   */
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm('signup')) return;

    setIsSubmitting(true);
    const sanitizedData = {
      fullName,
      username: username.trim().toLowerCase(),
      companyName,
      jobRole
    };
    const { error } = await signUp(email, password, sanitizedData);
    setIsSubmitting(false);

    if (error) {
      // Handle duplicate email case
      if (error.message.includes('User already registered')) {
        toast({
          title: 'Account exists',
          description: 'An account with this email already exists. Please sign in instead.',
          variant: 'destructive',
          className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
        });
        setActiveTab('signin'); // Switch to sign in tab
      } else {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
          className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto',
        });
      }
    } else {
      setShowVerification(true);
      setShowMagicLinkSent(false);
      // Send welcome email asynchronously
      supabase.functions.invoke('send-welcome-email', {
        body: { email, name: fullName }
      }).catch(err => console.error("Failed to send welcome email:", err));
    }
  };

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* ================================================================== */}
        {/* LOGO & BRANDING */}
        {/* ================================================================== */}
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6 group">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full group-hover:bg-primary/30 transition-colors duration-500"></div>
            <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-cyan-600 flex items-center justify-center shadow-xl shadow-primary/20 border border-white/20 overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1/2 bg-white/10 rounded-b-full blur-[2px]"></div>
              <Shield className="w-10 h-10 text-white drop-shadow-lg relative z-10" />
            </div>
          </div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900 dark:text-white">SecureWebOps</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">Small Business Security Assistant</p>
        </div>

        {/* ================================================================== */}
        {/* AUTH CARD */}
        {/* ================================================================== */}
        <Card>
          <CardHeader className="text-center pb-2">
            <CardTitle className="flex items-center justify-center gap-2">
            {showVerification || showMagicLinkSent ? 'Check Email' : isResetting ? 'Reset Password' : activeTab === 'signin' ? 'Welcome back' : 'Welcome'}
            </CardTitle>
            <CardDescription>
              {showVerification || showMagicLinkSent || isResetting ? '' : 'Sign in to your account or create a new one'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showVerification ? (
              <div className="text-center space-y-4 py-4">
                <MailCheck className="mx-auto w-12 h-12 text-primary" />
                <p className="text-sm">We've sent a verification link to <strong>{email}</strong>.</p>
                <Button variant="outline" className="w-full" onClick={() => { setShowVerification(false); setActiveTab('signin'); }}>Back to Login</Button>
              </div>
            ) : showMagicLinkSent ? (
              <div className="text-center space-y-4 py-4">
                <MailCheck className="mx-auto w-12 h-12 text-primary" />
                <p className="text-sm">
                  We&apos;ve sent a secure sign-in link to <strong>{email}</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Open the link in your email to finish signing in on this device.
                </p>
                <div className="h-6">
                  {timer > 0 ? (
                    <span className="text-[10px] text-muted-foreground italic">Resend available in {timer}s</span>
                  ) : (
                    <button type="button" onClick={handleRequestOTP} className="text-[10px] text-primary font-bold hover:underline">Resend Link</button>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowMagicLinkSent(false);
                    setTimer(0);
                  }}
                >
                  Back to Login
                </Button>
              </div>
            ) : isResetting ? (
              <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input placeholder="you@company.com" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <Button className="w-full" disabled={isSubmitting}>Send Reset Link</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setIsResetting(false)}>Cancel</Button>
              </form>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* Tab switcher */}
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

              {/* ============================================================ */}
              {/* SIGN IN FORM */}
              {/* ============================================================ */}
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  {/* Email field */}
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@company.com"
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  {/* Password field */}
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onPointerDown={beginPasswordPeek(setShowPassword)}
                        onPointerUp={endPasswordPeek(setShowPassword)}
                        onPointerLeave={endPasswordPeek(setShowPassword)}
                        onPointerCancel={endPasswordPeek(setShowPassword)}
                        onBlur={endPasswordPeek(setShowPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  </div>

                  <div className="flex justify-between items-center">
                    <button type="button" onClick={handleRequestOTP} className="text-xs text-primary hover:underline">Email Me a Sign-In Link</button>
                    <button type="button" onClick={() => setIsResetting(true)} className="text-xs text-primary hover:underline">Forgot password?</button>
                  </div>

                  {/* Submit button */}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* ============================================================ */}
              {/* SIGN UP FORM */}
              {/* ============================================================ */}
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Choose account type</h3>
                    <p className="text-xs text-muted-foreground">
                      You can create a personal account, or set up a company workspace for your team.
                    </p>
                    <RadioGroup
                      value={accountType || ''}
                      onValueChange={(value: 'personal' | 'company') => setAccountType(value)}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <Label
                        htmlFor="account-type-personal"
                        className={cn(
                          "flex flex-col items-start rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                          accountType === 'personal' && "border-primary ring-2 ring-primary ring-offset-2"
                        )}
                      >
                        <RadioGroupItem value="personal" id="account-type-personal" className="sr-only" />
                        <UserRound className="w-5 h-5 mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium">Personal account</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          For individual use. Your domains and work stay private to you.
                        </p>
                      </Label>
                      <Label
                        htmlFor="account-type-company"
                        className={cn(
                          "flex flex-col items-start rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer",
                          accountType === 'company' && "border-primary ring-2 ring-primary ring-offset-2"
                        )}
                      >
                        <RadioGroupItem value="company" id="account-type-company" className="sr-only" />
                        <Users className="w-5 h-5 mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium">Company workspace</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Create a team workspace and invite colleagues.
                        </p>
                      </Label>
                    </RadioGroup>
                    {errors.accountType && <p className="text-xs text-destructive">{errors.accountType}</p>}
                  </div>

                  {accountType && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="signup-full-name">Your Name</Label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-full-name"
                        type="text"
                        placeholder="Jane Doe"
                        className="pl-10"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <div className="relative">
                      <Input
                        id="signup-username"
                        type="text"
                        placeholder="johndoe"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                      <div className="absolute right-3 top-2.5">
                        {isValidating ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : isUsernameAvailable === true ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : isUsernameAvailable === false ? <XCircle className="w-4 h-4 text-destructive" /> : null}
                      </div>
                    </div>
                    {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
                  </div>

                  {accountType === 'company' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="signup-company-name">Company Name</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="signup-company-name"
                            type="text"
                            placeholder="Acme Inc."
                            className="pl-10"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                          />
                        </div>
                        {errors.companyName && <p className="text-xs text-destructive">{errors.companyName}</p>}
                        <p className="text-xs text-muted-foreground">
                          This will be the name of your company workspace.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-job-role">Job Role</Label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="signup-job-role"
                            type="text"
                            placeholder="e.g. Developer (optional)"
                            className="pl-10"
                            value={jobRole}
                            onChange={(e) => setJobRole(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Email field */}
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@company.com"
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  {/* Password field */}
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onPointerDown={beginPasswordPeek(setShowPassword)}
                        onPointerUp={endPasswordPeek(setShowPassword)}
                        onPointerLeave={endPasswordPeek(setShowPassword)}
                        onPointerCancel={endPasswordPeek(setShowPassword)}
                        onBlur={endPasswordPeek(setShowPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onPointerDown={beginPasswordPeek(setShowConfirmPassword)}
                        onPointerUp={endPasswordPeek(setShowConfirmPassword)}
                        onPointerLeave={endPasswordPeek(setShowConfirmPassword)}
                        onPointerCancel={endPasswordPeek(setShowConfirmPassword)}
                        onBlur={endPasswordPeek(setShowConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                  </div>

                  {/* Submit button */}
                  <Button type="submit" className="w-full" disabled={isSubmitting || isUsernameAvailable === false || isValidating || (username.length > 0 && username.length < 3)}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      companyName.trim() ? 'Create Company Workspace' : 'Create Personal Account'
                    )}
                  </Button>
                    </>
                  )}
                </form>
              </TabsContent>
            </Tabs>
            )}
          </CardContent>
        </Card>

        {/* ================================================================== */}
        {/* FOOTER */}
        {/* ================================================================== */}
        <p className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
