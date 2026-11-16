import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFriends, type Friend } from "@/hooks/useFriends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { UserMinus, MessageCircle, Users } from "lucide-react";

export default function FriendsAll() {
  const navigate = useNavigate();
  const { friends, isLoading, removeFriend } = useFriends();
  const [toRemove, setToRemove] = useState<Friend | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        backTo="/settings"
        backLabel="Settings"
        eyebrow="People"
        title="Friends"
        description="Everyone you can split expenses with and message inside FinTrack."
      />

      {isLoading && (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && friends.length === 0 && (
        <div className="glass-card">
          <EmptyState
            icon={Users}
            title="No friends yet"
            description="Search for a username in Settings to send a friend request."
            actionLabel="Go to Settings"
            onAction={() => navigate("/settings")}
          />
        </div>
      )}

      {!isLoading && friends.length > 0 && (
        <div className="glass-card divide-y divide-border/60 overflow-hidden">
          {friends.map((f) => (
            <div key={f.friend_id} className="flex items-center gap-3 p-3.5 sm:p-4">
              <Avatar className="h-10 w-10 shrink-0 border border-border">
                <AvatarImage src={f.avatar_url || undefined} alt={f.display_name || f.username || "Friend"} />
                <AvatarFallback>{(f.display_name || f.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{f.display_name || f.username}</p>
                <p className="truncate text-[11px] text-muted-foreground">@{f.username}</p>
              </div>

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                onClick={() => navigate(`/chat/${f.friend_id}`)}
                aria-label={`Chat with ${f.display_name || f.username}`}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setToRemove(f)}
              >
                <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Remove</span>
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove friend?"
        description={`${toRemove?.display_name || toRemove?.username || "This friend"} will be removed from your friends list. You can send a new request later.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (toRemove) removeFriend.mutate(toRemove.friend_id);
          setToRemove(null);
        }}
      />
    </div>
  );
}
