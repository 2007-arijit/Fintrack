import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFriends, type Friend } from "@/hooks/useFriends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ArrowLeft, UserMinus, MessageCircle, Users } from "lucide-react";

export default function FriendsAll() {
  const navigate = useNavigate();
  const { friends, isLoading, removeFriend } = useFriends();
  const [toRemove, setToRemove] = useState<Friend | null>(null);

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-heading font-bold text-2xl">All Friends</h1>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && friends.length === 0 && (
        <EmptyState
          icon={Users}
          title="No friends yet"
          description="Search for a username in Settings to send a friend request."
        />
      )}

      {!isLoading && friends.length > 0 && (
        <div className="space-y-2">
          {friends.map((f) => (
            <div key={f.friend_id} className="glass-card p-4 flex items-center gap-3">
              <Avatar className="h-11 w-11 border border-border shrink-0">
                <AvatarImage src={f.avatar_url || undefined} alt={f.display_name || f.username || "Friend"} />
                <AvatarFallback>{(f.display_name || f.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{f.display_name || f.username}</p>
                <p className="text-xs text-muted-foreground truncate">@{f.username}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => navigate(`/chat/${f.friend_id}`)} title="Chat">
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-border text-destructive hover:text-destructive gap-1 shrink-0"
                onClick={() => setToRemove(f)}
              >
                <UserMinus className="h-3.5 w-3.5" /> Remove
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
