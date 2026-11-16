import { useState } from "react";
import { Link } from "react-router-dom";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Button } from "@/components/ui/button";
import { Zap, X } from "lucide-react";

const DISMISS_KEY = "fintrack_upi_banner_dismissed_at";
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/** Nudges the user to add their UPI ID so friends can pay them directly
 *  through Settle Up's QR/deep-link flow. Shown on Split screens only. */
export function UpiSetupBanner() {
  const { preferences, isLoading } = useUserPreferences();
  const [dismissed, setDismissed] = useState(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
  });

  if (isLoading || dismissed || preferences?.upi_id) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="glass-card flex items-center gap-3 p-3 animate-fade-in border-primary/30">
      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
        <Zap className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Add your UPI ID</p>
        <p className="text-xs text-muted-foreground">So friends can pay you directly with a QR code when settling up.</p>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/settings">Set up</Link>
      </Button>
      <button onClick={handleDismiss} aria-label="Dismiss UPI setup banner" className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
