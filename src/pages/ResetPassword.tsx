import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    let mounted = true;

    const prepareRecoverySession = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const recoveryType = hashParams.get('type');

        if (accessToken && refreshToken && recoveryType === 'recovery') {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;
          if (!data.session) throw new Error('Reset link could not establish a session. Please request a new link.');

          window.history.replaceState({}, document.title, window.location.pathname);
          if (mounted) {
            setSessionReady(true);
            setSessionError(null);
          }
          return;
        }

        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription));
        }

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (!data.session) throw new Error('Reset link could not establish a session. Please request a new link.');

          window.history.replaceState({}, document.title, window.location.pathname);
          if (mounted) {
            setSessionReady(true);
            setSessionError(null);
          }
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          throw new Error('Your password reset session expired. Please request a new reset link.');
        }

        if (mounted) {
          setSessionReady(true);
          setSessionError(null);
        }
      } catch (error: any) {
        if (!mounted) return;
        setSessionError(error?.message || 'Unable to verify your reset session. Please request a new link.');
      }
    };

    prepareRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  const beginPasswordPeek = (setter: (value: boolean) => void) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setter(true);
  };

  const endPasswordPeek = (setter: (value: boolean) => void) => () => {
    setter(false);
  };

  const handleUpdatePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionReady) {
      return toast({
        title: "Reset Link Not Ready",
        description: sessionError || "We are still preparing your password reset session. Please try again in a moment.",
        variant: "destructive",
        className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto'
      });
    }
    if (password !== confirmPassword) {
      return toast({ title: "Error", description: "Passwords do not match", variant: "destructive", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    }
    if (password.length < 6) {
      return toast({ title: "Error", description: "Password must be at least 6 characters long.", variant: "destructive", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    }
    if (/[<>'"]/.test(password)) {
      return toast({ title: "Error", description: "Invalid characters (<, >, ', \") are not allowed.", variant: "destructive", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    }

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setLoading(false);
      return toast({
        title: "Reset Link Expired",
        description: "Your reset session was lost. Please request a new password reset link.",
        variant: "destructive",
      });
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: "Password Update Failed", description: error.message, variant: "destructive", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
    } else {
      localStorage.removeItem('awaiting_password_reset');
      toast({ title: "Password Updated", description: "You can now continue to your dashboard.", className: 'fixed top-4 right-4 md:top-4 md:right-4 z-[100] w-[calc(100%-2rem)] sm:w-auto' });
      window.location.href = '/dashboard';
    }
  }, [password, confirmPassword, sessionError, sessionReady]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
      <Card className="w-full max-w-md border-t-4 border-t-primary shadow-2xl">
        <CardHeader><CardTitle>Reset Your Password</CardTitle></CardHeader>
        <CardContent>
          {sessionError && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-left text-sm text-destructive">
              {sessionError}
            </div>
          )}
          <form onSubmit={handleUpdatePassword} className="space-y-4 text-left">
            <div className="space-y-1">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
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
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                  required
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
            </div>
            <Button className="w-full bg-primary" disabled={loading || !sessionReady || !password || password !== confirmPassword}>
              {loading ? <><Loader2 className="mr-2 animate-spin h-4 w-4" /> Updating...</> : sessionReady ? "Update Password" : "Preparing Reset Link..."}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
