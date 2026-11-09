import { ReactNode, useState } from "react";
import { useUserPreferences, isValidUsername } from "@/hooks/useUserPreferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AtSign } from "lucide-react";
import { toast } from "sonner";

export function RequireUsername({ children }: { children: ReactNode }) {
  const { preferences, isLoading, updatePreferences } = useUserPreferences();
  const [value, setValue] = useState("");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (preferences && !preferences.username) {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const u = value.trim().toLowerCase();
      if (!isValidUsername(u)) {
        toast.error("Username must be 3-20 characters: lowercase letters, numbers, and underscores only.");
        return;
      }
      updatePreferences.mutate({ username: u });
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-card p-8 w-full max-w-sm animate-fade-in">
          <div className="flex items-center gap-2 justify-center mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <AtSign className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="font-heading font-semibold text-lg text-center mb-2">Choose a username</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Your username is unique across FinTrack — friends use it to find you and add you to Split groups.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Username</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value.toLowerCase())}
                className="bg-secondary border-border"
                placeholder="unique_username"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={updatePreferences.isPending}>
              Continue
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
