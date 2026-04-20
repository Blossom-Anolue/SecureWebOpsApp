import { useLocation, Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="relative w-24 h-24 mx-auto mb-6 group">
          <div className="absolute inset-0 bg-destructive/20 blur-xl rounded-full"></div>
          <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-destructive via-destructive/90 to-orange-600 flex items-center justify-center shadow-xl shadow-destructive/20 border border-white/20">
            <ShieldAlert className="w-12 h-12 text-white drop-shadow-lg relative z-10" />
          </div>
        </div>
        
        <h1 className="mb-2 text-4xl md:text-5xl font-bold font-display tracking-tight text-slate-900 dark:text-white">404</h1>
        <h2 className="mb-4 text-xl font-semibold text-slate-700 dark:text-slate-300">Page Not Found</h2>
        <p className="mb-8 text-muted-foreground">
          We couldn't find the page you were looking for at <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">{location.pathname}</span>. It might have been removed, renamed, or didn't exist in the first place.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)} className="w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/">
              <Home className="w-4 h-4 mr-2" />
              Return to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
