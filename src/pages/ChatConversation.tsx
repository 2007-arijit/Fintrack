import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConversation, type ChatMessage } from "@/hooks/useChat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Send, Search, MoreVertical, Trash2, Check, CheckCheck, Loader2, MessageCircleOff, MessageCircle } from "lucide-react";

function formatBubbleTime(iso: string) {
  const date = new Date(iso);
  return format(date, "h:mm a");
}

function formatDayDivider(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

export default function ChatConversation() {
  const { friendId } = useParams<{ friendId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlderMessages,
    monthlyCount,
    monthlyLimit,
    limitReached,
    peerTyping,
    notifyTyping,
    sendMessage,
    deleteMessage,
    error,
  } = useConversation(friendId);

  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const { data: friendProfile } = useQuery({
    queryKey: ["profile", friendId],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("user_preferences")
        .select("display_name, username, avatar_url")
        .eq("user_id", friendId!)
        .single();
      if (fetchError) throw fetchError;
      return data;
    },
    enabled: !!friendId,
  });

  // Auto-scroll to bottom on first load and when a new message arrives at the bottom.
  useEffect(() => {
    if (messages.length === 0) return;
    if (isInitialLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      isInitialLoad.current = false;
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 80 && hasMore && !loadingOlder) {
      const prevHeight = container.scrollHeight;
      loadOlderMessages().then(() => {
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - prevHeight;
        });
      });
    }
  };

  const handleSend = () => {
    if (!draft.trim() || limitReached) return;
    sendMessage.mutate(draft, { onSuccess: () => setDraft("") });
  };

  const visibleMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => !m.deleted_at && m.content.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const lastOwnMessage = useMemo(() => [...messages].reverse().find((m) => m.sender_id === user?.id), [messages, user?.id]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <EmptyState icon={MessageCircleOff} title="Can't open this chat" description={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-150px)] max-w-2xl flex-col md:h-[calc(100dvh-110px)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/70 pb-3">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/chat")}
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9 shrink-0 border border-border">
          <AvatarImage src={friendProfile?.avatar_url || undefined} alt={friendProfile?.display_name || "Friend"} />
          <AvatarFallback>{(friendProfile?.display_name || friendProfile?.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {friendProfile?.display_name || friendProfile?.username || "Chat"}
          </p>
          <p className="h-4 text-[11px] text-muted-foreground" aria-live="polite">
            {peerTyping ? "typing…" : `\u00A0`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => setSearchOpen((s) => !s)}
          aria-label={searchOpen ? "Close message search" : "Search messages"}
          aria-pressed={searchOpen}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {searchOpen && (
        <div className="border-b border-border/70 py-2">
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search this conversation…"
            aria-label="Search messages in this chat"
            className="h-9 border-border bg-secondary/40"
          />
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-1 overflow-y-auto py-4"
        aria-label="Message history"
      >
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className={`h-10 rounded-2xl ${i % 2 === 0 ? "w-2/3 ml-auto" : "w-1/2"}`} />
            ))}
          </div>
        )}

        {!loading && loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            description={`Say hello to ${friendProfile?.display_name || friendProfile?.username || "your friend"} 👋`}
          />
        )}

        {!loading &&
          visibleMessages.map((msg, i) => {
            const mine = msg.sender_id === user?.id;
            const prev = visibleMessages[i - 1];
            const showDivider = !prev || formatDayDivider(prev.created_at) !== formatDayDivider(msg.created_at);
            const isLastOwn = lastOwnMessage?.id === msg.id;

            return (
              <div key={msg.id}>
                {showDivider && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full border border-border/70 bg-card px-3 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {formatDayDivider(msg.created_at)}
                    </span>
                  </div>
                )}
                <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[82%] items-end gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${
                        mine
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border border-border/60 bg-secondary/70 text-secondary-foreground"
                      } ${msg.deleted_at ? "italic opacity-60" : ""}`}
                    >
                      {msg.deleted_at ? "Message deleted" : msg.content}
                      <div className={`flex items-center gap-1 mt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
                        <span className="text-[10px] opacity-70">{formatBubbleTime(msg.created_at)}</span>
                        {mine && isLastOwn && !msg.deleted_at && (
                          msg.read_at ? (
                            <CheckCheck className="h-3 w-3 opacity-80" />
                          ) : (
                            <Check className="h-3 w-3 opacity-70" />
                          )
                        )}
                      </div>
                    </div>
                    {mine && !msg.deleted_at && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                            aria-label="Message options"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(msg)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="space-y-1.5 border-t border-border/70 pt-3">
        {limitReached ? (
          <p className="py-1 text-center text-xs text-destructive">Monthly chat limit reached.</p>
        ) : (
          monthlyCount >= monthlyLimit - 10 && (
            <p className="text-center text-[11px] text-muted-foreground">
              {monthlyCount} / {monthlyLimit} messages used this month
            </p>
          )
        )}
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={limitReached ? "Monthly chat limit reached." : "Write a message…"}
            disabled={limitReached || sendMessage.isPending}
            aria-label="Message"
            className="h-10 border-border bg-secondary/40"
          />
          <Button
            onClick={handleSend}
            disabled={!draft.trim() || limitReached || sendMessage.isPending}
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Send message"
          >
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete message?"
        description="This will delete the message for both you and the recipient."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (toDelete) deleteMessage.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
