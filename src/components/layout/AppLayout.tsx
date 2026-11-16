import { ReactNode, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { FloatingAddButton } from "./FloatingAddButton";
import { NotificationPermissionPrompt } from "@/components/NotificationPermissionPrompt";
import { useLastSeenHeartbeat } from "@/hooks/useLastSeenHeartbeat";

interface AppLayoutProps {
  children: ReactNode;
}

const SECTION_LABELS: { match: (path: string) => boolean; label: string }[] = [
  { match: (p) => p === "/", label: "Overview" },
  { match: (p) => p.startsWith("/transactions"), label: "Transactions" },
  { match: (p) => p.startsWith("/payshield"), label: "PayShield" },
  { match: (p) => p.startsWith("/debt"), label: "Debt Tracker" },
  { match: (p) => p.startsWith("/split"), label: "Split" },
  { match: (p) => p.startsWith("/chat"), label: "Chat" },
  { match: (p) => p.startsWith("/friends"), label: "Friends" },
  { match: (p) => p.startsWith("/reports"), label: "Reports" },
  { match: (p) => p.startsWith("/budgets"), label: "Budgets" },
  { match: (p) => p.startsWith("/settings"), label: "Settings" },
  { match: (p) => p.startsWith("/dev"), label: "Developer" },
];

export function AppLayout({ children }: AppLayoutProps) {
  useLastSeenHeartbeat();
  const { pathname } = useLocation();
  const section = SECTION_LABELS.find((item) => item.match(pathname))?.label ?? "FinTrack";

  return (
    <SidebarProvider>
      <NotificationPermissionPrompt />
      <div className="flex w-full bg-atmosphere" style={{ minHeight: "100dvh" }}>
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col" style={{ minHeight: "100dvh" }}>
          {/* Slim desktop orientation bar — the page itself owns the real header. */}
          <header className="hidden h-12 items-center gap-3 border-b border-border/50 bg-background/30 px-4 backdrop-blur-sm md:flex lg:px-8">
            <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:bg-secondary/70 hover:text-foreground" />
            <span className="h-3.5 w-px bg-border" aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground">{section}</span>
          </header>

          <main
            className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
            style={{
              paddingTop: "max(1rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))",
              paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            <div className="mx-auto w-full max-w-[1320px] px-4 pb-4 md:px-8 lg:px-10">
              <Suspense
                fallback={
                  <div className="space-y-4" aria-busy="true">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-28 w-full rounded-2xl" />
                    <Skeleton className="h-64 w-full rounded-2xl" />
                  </div>
                }
              >
                <div key={pathname} className="page-enter">
                  {children}
                </div>
              </Suspense>
            </div>
          </main>
        </div>
        <MobileBottomNav />
        <FloatingAddButton />
      </div>
    </SidebarProvider>
  );
}
