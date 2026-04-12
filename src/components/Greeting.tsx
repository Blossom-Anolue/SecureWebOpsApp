import React, { useEffect, useState } from 'react';
import { Sun, CloudSun, Moon, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const Greeting: React.FC = () => {
  const [greeting, setGreeting] = useState("");
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  if (loading) return <Loader2 className="animate-spin text-slate-300" size={20} />;

  // Fallback: Use full_name from profile, then metadata, then email, then 'User'
  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || "User";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-primary">
        {greeting === "Good morning" && <Sun size={20} />}
        {greeting === "Good afternoon" && <CloudSun size={20} />}
        {greeting === "Good evening" && <Moon size={20} />}
        <span className="text-xs font-bold uppercase tracking-widest opacity-70">
          Secure Session Active
        </span>
      </div>
      <h1 className="text-2xl lg:text-4xl font-extrabold font-display tracking-tight text-slate-900 capitalize">
        {greeting}, {userName}!
      </h1>
    </div>
  );
};

export default Greeting;