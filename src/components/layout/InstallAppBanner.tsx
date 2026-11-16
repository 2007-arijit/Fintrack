import { useState } from "react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "fintrack_install_banner_dismissed_at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function InstallAppBanner() {
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
  });

  if (!isInstallable || isInstalled || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) setDismissed(true);
  };

  return (
    <div className="glass-card flex items-center gap-3 p-3 animate-fade-in">
      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
        <Download className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Install FinTrack</p>
        <p className="text-xs text-muted-foreground">Add it to your home screen for the full app experience.</p>
      </div>
      <Button size="sm" onClick={handleInstall} className="shrink-0">
        Install
      </Button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install banner"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
