import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePushPrompt } from "@/hooks/usePushNotifications";
import { Bell } from "lucide-react";

export function NotificationPermissionPrompt() {
  const { shouldPrompt, enable, dismiss } = usePushPrompt();

  return (
    <Dialog open={shouldPrompt} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="bg-card border-border max-w-sm text-center">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="p-3 rounded-lg bg-primary/10">
              <Bell className="h-6 w-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="font-heading text-center">Turn on notifications?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2 mb-2">
          Get notified about split reminders, settle-ups, and updates from friends — right on your lock screen.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-border" onClick={dismiss}>
            Not now
          </Button>
          <Button className="flex-1" onClick={enable}>
            Turn on
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
