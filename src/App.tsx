import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";

const Home = lazy(() => import("@/pages/Home"));
const Auth = lazy(() => import("@/pages/Auth"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Scans = lazy(() => import("@/pages/Scans"));
const NewScan = lazy(() => import("@/pages/NewScan"));
const ScanDetail = lazy(() => import("@/pages/ScanDetail"));
const PhishingCheck = lazy(() => import("@/pages/PhishingCheck"));
const PhishingHistory = lazy(() => import("@/pages/PhishingHistory"));
const Training = lazy(() => import("@/pages/Training"));
const Settings = lazy(() => import("@/pages/Settings"));
const ActivityLog = lazy(() => import("@/pages/ActivityLog"));
const WorkspaceAdmin = lazy(() => import("@/pages/WorkspaceAdmin"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const SecureVault = lazy(() => import("./pages/SecureVault"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
  </div>
);

const GlobalRedirects = () => {
  const { isAwaitingPasswordReset } = useAuth();
  const location = useLocation();
  if (isAwaitingPasswordReset && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />;
  }
  return null;
};

const RealtimeListener = () => {
  useRealtimeNotifications();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <GlobalRedirects />
            <RealtimeListener />
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                
                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/scans" element={<Scans />} />
                    <Route path="/scans/new" element={<NewScan />} />
                    <Route path="/scans/:scanId" element={<ScanDetail />} />
                    <Route path="/phishing" element={<Navigate to="/phishing/check" replace />} />
                    <Route path="/phishing/check" element={<PhishingCheck />} />
                    <Route path="/phishing/history" element={<PhishingHistory />} />
                    <Route path="/training" element={<Training />} />
                    <Route path="/training/lessons" element={<Training />} />
                    <Route path="/training/simulations" element={<Training />} />
                    <Route path="/activity" element={<ActivityLog />} />
                    <Route path="/workspace-admin" element={<WorkspaceAdmin />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/encrypt" element={<SecureVault />} />
                    <Route path="/vault" element={<SecureVault />} />
                  </Route>
                </Route>
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
