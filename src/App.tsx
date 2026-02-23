import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Home from "@/pages/Home";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Scans from "@/pages/Scans";
import NewScan from "@/pages/NewScan";
import ScanDetail from "@/pages/ScanDetail";
import PhishingCheck from "@/pages/PhishingCheck";
import PhishingHistory from "@/pages/PhishingHistory";
import Training from "@/pages/Training";
import Settings from "@/pages/Settings";
import Team from "@/pages/Team";
import ActivityLog from "@/pages/ActivityLog";
import NotFound from "@/pages/NotFound";
import PDFEncryption from './pages/PDFEncryption';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/auth" element={<Auth />} />
              
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
                  <Route path="/team" element={<Team />} />
                  <Route path="/activity" element={<ActivityLog />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/encrypt" element={<PDFEncryption />} />
                </Route>
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
