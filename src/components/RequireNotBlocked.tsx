import { ReactNode, useEffect, useState } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0h 0m";
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function BlockedScreen({ until }: { until: string }) {
  const { signOut } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const untilMs = new Date(until).getTime();
  const remaining = untilMs - now;

  // The block just expired while this screen was open — reload to re-check.
  if (remaining <= 0) {
    window.location.reload();
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass-card p-8 w-full max-w-sm text-center animate-fade-in">
        <div className="flex items-center justify-center mb-4">
          <div className="p-3 rounded-lg bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
        </div>
        <h2 className="font-heading font-semibold text-lg mb-2">Account temporarily blocked</h2>
        <p className="text-sm text-muted-foreground mb-1">Your access has been temporarily restricted.</p>
        <p className="text-2xl font-bold my-4">{formatRemaining(remaining)}</p>
        <p className="text-xs text-muted-foreground mb-6">remaining until you can use FinTrack again.</p>
        <Button variant="outline" className="w-full border-border" onClick={() => signOut()}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export function RequireNotBlocked({ children }: { children: ReactNode }) {
  const { preferences, isLoading } = useUserPreferences();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (preferences?.blocked_until && new Date(preferences.blocked_until).getTime() > Date.now()) {
    return <BlockedScreen until={preferences.blocked_until} />;
  }

  return <>{children}</>;
}
