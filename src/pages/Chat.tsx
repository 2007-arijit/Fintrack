import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { useConversations } from "@/hooks/useChat";
import { useFriends } from "@/hooks/useFriends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { MessageCircle, ArrowUpRight } from "lucide-react";

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
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        eyebrow="Messages"
        title="Chat"
        description="Private conversations with the friends you split and settle with. Nothing here is shared with anyone else."
      />

      {isLoading && (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && conversations.length === 0 && friendsWithoutChat.length === 0 && !friendsLoading && (
        <div className="glass-card">
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Add friends in Settings to start chatting — chat is available to friends only."
            actionLabel="Find friends"
            onAction={() => navigate("/settings")}
          />
        </div>
      )}

      {!isLoading && conversations.length > 0 && (
        <div className="glass-card divide-y divide-border/60 overflow-hidden">
          {conversations.map((c) => (
            <button
              key={c.conversation_id}
              type="button"
              onClick={() => navigate(`/chat/${c.friend_id}`)}
              className="tx-row flex w-full items-center gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-4"
            >
              <Avatar className="h-11 w-11 shrink-0 border border-border">
                <AvatarImage src={c.friend_avatar_url || undefined} alt={c.friend_display_name || "Friend"} />
                <AvatarFallback>{(c.friend_display_name || c.friend_username || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.friend_display_name || c.friend_username}
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatTimestamp(c.last_message_at)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">{c.last_message || "Say hello 👋"}</p>
                  {c.unread_count > 0 && (
                    <Badge className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                      {c.unread_count > 9 ? "9+" : c.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {friendsWithoutChat.length > 0 && (
        <section className="space-y-3" aria-labelledby="start-chat">
          <h2 id="start-chat" className="eyebrow">
            Start a conversation
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {friendsWithoutChat.map((f) => (
              <button
                key={f.friend_id}
                type="button"
                onClick={() => navigate(`/chat/${f.friend_id}`)}
                className="group glass-card flex items-center gap-3 p-3 text-left transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar className="h-9 w-9 shrink-0 border border-border">
                  <AvatarImage src={f.avatar_url || undefined} alt={f.display_name || "Friend"} />
                  <AvatarFallback>{(f.display_name || f.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{f.display_name || f.username}</p>
                  <p className="truncate text-[11px] text-muted-foreground">@{f.username}</p>
                </div>
                <ArrowUpRight
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
