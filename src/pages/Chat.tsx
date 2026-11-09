import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { useConversations } from "@/hooks/useChat";
import { useFriends } from "@/hooks/useFriends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { MessageCircle, Users } from "lucide-react";

function formatTimestamp(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

export default function Chat() {
  const navigate = useNavigate();
  const { conversations, isLoading } = useConversations();
  const { friends, isLoading: friendsLoading } = useFriends();

  // Friends without an existing conversation yet — shown so you can start one.
  const conversationFriendIds = new Set(conversations.map((c) => c.friend_id));
  const friendsWithoutChat = friends.filter((f) => !conversationFriendIds.has(f.friend_id));

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <h1 className="font-heading font-bold text-2xl">Chat</h1>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && conversations.length === 0 && friendsWithoutChat.length === 0 && !friendsLoading && (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Add friends in Settings to start chatting — chat is available to friends only."
          actionLabel="Find Friends"
          onAction={() => navigate("/settings")}
        />
      )}

      {!isLoading && conversations.length > 0 && (
        <div className="space-y-2">
          {conversations.map((c) => (
            <button
              key={c.conversation_id}
              onClick={() => navigate(`/chat/${c.friend_id}`)}
              className="w-full glass-card p-4 flex items-center gap-3 text-left hover:bg-secondary/40 transition-colors"
            >
              <Avatar className="h-12 w-12 border border-border shrink-0">
                <AvatarImage src={c.friend_avatar_url || undefined} alt={c.friend_display_name || "Friend"} />
                <AvatarFallback>{(c.friend_display_name || c.friend_username || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{c.friend_display_name || c.friend_username}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{formatTimestamp(c.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground truncate">{c.last_message || "Say hello 👋"}</p>
                  {c.unread_count > 0 && (
                    <Badge className="bg-primary text-primary-foreground shrink-0">{c.unread_count}</Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {friendsWithoutChat.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Start a new chat
          </h2>
          {friendsWithoutChat.map((f) => (
            <button
              key={f.friend_id}
              onClick={() => navigate(`/chat/${f.friend_id}`)}
              className="w-full glass-card p-3 flex items-center gap-3 text-left hover:bg-secondary/40 transition-colors"
            >
              <Avatar className="h-9 w-9 border border-border shrink-0">
                <AvatarImage src={f.avatar_url || undefined} alt={f.display_name || "Friend"} />
                <AvatarFallback>{(f.display_name || f.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-medium truncate">{f.display_name || f.username}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
