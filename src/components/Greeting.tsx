import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useSecurityData';
import { useMemo } from 'react';

export default function Greeting() {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  // Dynamically calculate the time of day and assign the appropriate greeting and emoji
  const { greeting, emoji } = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { greeting: 'Good morning', emoji: '☀️' };
    if (hour < 17) return { greeting: 'Good afternoon', emoji: '👋' };
    return { greeting: 'Good evening', emoji: '🌙' };
  }, []);

  // Gracefully fallback through available names (Full Name -> Username -> Email Prefix -> 'there')
  const displayName = profile?.full_name 
    || (profile as any)?.username 
    || user?.email?.split('@')[0] 
    || 'there';

  return (
    <div className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 py-2">
      <h1 className="text-3xl md:text-4xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
        {greeting},{' '}
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-cyan-500 dark:from-primary dark:to-cyan-400">
          {displayName}
        </span>!
      </h1>
      <span className="text-3xl md:text-4xl inline-block origin-bottom-right transition-transform duration-300 hover:rotate-12 hover:scale-110 cursor-default drop-shadow-sm">
        {emoji}
      </span>
    </div>
  );
}