import { ReactNode, Suspense } from "react";
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

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  useLastSeenHeartbeat();

  return (
    <SidebarProvider>
      <NotificationPermissionPrompt />
      <div className="flex w-full" style={{ minHeight: "100dvh" }}>
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: "100dvh" }}>
          {/* Desktop-only top bar. On mobile each page renders its own header,
              so top safe-area padding is applied directly on <main> instead. */}
          <header className="h-0 hidden md:flex md:h-12 items-center border-b border-border px-4 md:px-6">
            <SidebarTrigger />
          </header>
          <main
            className="flex-1 min-w-0 px-4 md:px-6 overflow-x-hidden overflow-y-auto"
            style={{
              paddingTop: "max(1rem, calc(env(safe-area-inset-top, 0px) + 0.75rem))",
              paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
          </main>
        </div>
        <MobileBottomNav />
        <FloatingAddButton />
      </div>
    </SidebarProvider>
  );
}
