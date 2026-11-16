import { Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Calm bootstrap screen shown while the session is being restored.
 * Deliberately quiet: the brand mark, one line of copy and a hairline
 * progress shimmer. No spinner-in-a-card, no layout that jumps when the
 * app replaces it.
 */
export function BootScreen({ message = "Opening your ledger" }: { message?: string }) {
  return (
    <div className="bg-atmosphere flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex items-center gap-2.5" role="status" aria-live="polite">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">FinTrack</span>
      </div>

      <div className="w-44">
        <div className="ps-scan-bar h-[2px] w-full rounded-full bg-border" aria-hidden="true" />
        <p className="mt-3 text-center text-xs tracking-wide text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Shown when the session or database cannot be reached at startup. */
export function BootError({ message }: { message: string }) {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    window.location.assign("/auth");
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground">FinTrack</span>
      </div>

      <div className="max-w-sm space-y-3 text-center" role="alert">
        <p className="text-sm font-medium text-foreground">Couldn&rsquo;t open your ledger</p>
        <p className="break-words text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}
