import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireUsername } from "@/components/RequireUsername";
import { RequireNotBlocked } from "@/components/RequireNotBlocked";
import { RequireDeveloper } from "@/components/RequireDeveloper";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Auth from "@/pages/Auth";
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Budgets = lazy(() => import("@/pages/Budgets"));
const Reports = lazy(() => import("@/pages/Reports"));
const Settings = lazy(() => import("@/pages/Settings"));
const ChangeAvatar = lazy(() => import("@/pages/ChangeAvatar"));
const Chat = lazy(() => import("@/pages/Chat"));
const ChatConversation = lazy(() => import("@/pages/ChatConversation"));
const FriendsAll = lazy(() => import("@/pages/FriendsAll"));
const FriendRequests = lazy(() => import("@/pages/FriendRequests"));
const DebtPage = lazy(() => import("@/pages/Debt"));
const SplitHome = lazy(() => import("@/pages/split/SplitHome"));
const SplitGroupDetail = lazy(() => import("@/pages/split/SplitGroupDetail"));
const InviteAccept = lazy(() => import("@/pages/split/InviteAccept"));
const DevDashboard = lazy(() => import("@/pages/dev/DevDashboard"));
const AdminUsers = lazy(() => import("@/pages/dev/AdminUsers"));
const AdminPushNotifications = lazy(() => import("@/pages/dev/AdminPushNotifications"));
import NotFound from "@/pages/NotFound";
const PayShield = lazy(() => import("@/pages/PayShield"));

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, authError } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  if (authError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-2">
          <div className="text-destructive font-semibold">Couldn't connect</div>
          <div className="text-sm text-muted-foreground break-words">{authError}</div>
        </div>
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <RequireUsername>
      <RequireNotBlocked>{children}</RequireNotBlocked>
    </RequireUsername>
  );
}

function AppRoutes() {
  const { user, loading, authError } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );

  if (authError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-2">
          <div className="text-destructive font-semibold">Couldn't connect</div>
          <div className="text-sm text-muted-foreground break-words">{authError}</div>
        </div>
      </div>
    );

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><AppLayout><Transactions /></AppLayout></ProtectedRoute>} />
      <Route path="/payshield" element={<ProtectedRoute><AppLayout><PayShield /></AppLayout></ProtectedRoute>} />
      <Route path="/budgets" element={<ProtectedRoute><AppLayout><Budgets /></AppLayout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      <Route path="/settings/avatar" element={<ProtectedRoute><AppLayout><ChangeAvatar /></AppLayout></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><AppLayout><FriendsAll /></AppLayout></ProtectedRoute>} />
      <Route path="/friends/requests" element={<ProtectedRoute><AppLayout><FriendRequests /></AppLayout></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><AppLayout><Chat /></AppLayout></ProtectedRoute>} />
      <Route path="/chat/:friendId" element={<ProtectedRoute><AppLayout><ChatConversation /></AppLayout></ProtectedRoute>} />
      <Route path="/debt" element={<ProtectedRoute><AppLayout><DebtPage /></AppLayout></ProtectedRoute>} />

      {/* Developer dashboard — gated on is_developer, in addition to normal auth */}
      <Route path="/dev" element={<ProtectedRoute><RequireDeveloper><AppLayout><DevDashboard /></AppLayout></RequireDeveloper></ProtectedRoute>} />
      <Route path="/dev/users" element={<ProtectedRoute><RequireDeveloper><AppLayout><AdminUsers /></AppLayout></RequireDeveloper></ProtectedRoute>} />
      <Route path="/dev/push" element={<ProtectedRoute><RequireDeveloper><AppLayout><AdminPushNotifications /></AppLayout></RequireDeveloper></ProtectedRoute>} />

      {/* Split renders inside the normal app shell (sidebar / bottom nav), same tab. */}
      <Route path="/split" element={<ProtectedRoute><AppLayout><SplitHome /></AppLayout></ProtectedRoute>} />
      <Route path="/split/:id" element={<ProtectedRoute><AppLayout><SplitGroupDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/invite/:code" element={<InviteAccept />} />
      {/* Back-compat redirects for the old in-app Groups routes */}
      <Route path="/groups" element={<Navigate to="/split" replace />} />
      <Route path="/groups/:id" element={<Navigate to="/split" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="fintrack-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <CurrencyProvider>
              <ScrollToTop />
              <ErrorBoundary>
                <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </CurrencyProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
