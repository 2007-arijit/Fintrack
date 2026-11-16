import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface ConversationSummary {
  conversation_id: string;
  friend_id: string;
  friend_username: string | null;
  friend_display_name: string | null;
  friend_avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

const MESSAGE_PAGE_SIZE = 30;
const MONTHLY_LIMIT = 60;

/** Conversation list for the Chat home screen, kept live via Realtime. */
export function useConversations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_conversations");
      if (error) throw error;
      return data as ConversationSummary[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`conversations-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, queryClient]);

  return { conversations: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}

/** Total unread badge count for the bottom nav / sidebar. */
export function useUnreadCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["unread_count", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_total_unread_count");
      if (error) throw error;
      return data as number;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-count-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread_count"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, queryClient]);

  return query.data ?? 0;
}

/**
 * Full conversation-with-a-friend experience: resolves/creates the
 * conversation, paginates messages, subscribes to realtime inserts/
 * updates/deletes, tracks the monthly send limit, exposes typing
 * indicators via Realtime broadcast, and marks messages read.
 */
export function useConversation(friendId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [peerTyping, setPeerTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve (or create) the conversation with this friend.
  useEffect(() => {
    if (!friendId || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .rpc("get_or_create_conversation", { _friend_id: friendId })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
          setLoading(false);
          return;
        }
        setConversationId(data as string);
      });
    return () => {
      cancelled = true;
    };
  }, [friendId, user]);

  const loadInitialMessages = useCallback(async (convId: string) => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .range(0, MESSAGE_PAGE_SIZE - 1);
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }
    const rows = (data as ChatMessage[]).reverse();
    setMessages(rows);
    setHasMore((data as ChatMessage[]).length === MESSAGE_PAGE_SIZE);
    setLoading(false);
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    const { data, error: fetchError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .range(0, MESSAGE_PAGE_SIZE - 1);
    if (fetchError) {
      toast.error(fetchError.message);
      setLoadingOlder(false);
      return;
    }
    const rows = (data as ChatMessage[]).reverse();
    setMessages((prev) => [...rows, ...prev]);
    setHasMore((data as ChatMessage[]).length === MESSAGE_PAGE_SIZE);
    setLoadingOlder(false);
  }, [conversationId, loadingOlder, hasMore, messages]);

  const refreshMonthlyCount = useCallback(async (convId: string) => {
    const { data } = await supabase.rpc("get_monthly_message_count", { _conversation_id: convId });
    setMonthlyCount((data as number) ?? 0);
  }, []);

  const markRead = useCallback(async (convId: string) => {
    await supabase.rpc("mark_conversation_read", { _conversation_id: convId });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["unread_count"] });
  }, [queryClient]);

  // Load messages + subscribe once we have a conversation id.
  useEffect(() => {
    if (!conversationId || !user) return;

    loadInitialMessages(conversationId);
    refreshMonthlyCount(conversationId);
    markRead(conversationId);

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender_id === user.id) {
            refreshMonthlyCount(conversationId);
          } else {
            markRead(conversationId);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const oldMsg = payload.old as ChatMessage;
          setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
        }
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload?.user_id === user.id) return;
        setPeerTyping(!!payload.payload?.typing);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        if (payload.payload?.typing) {
          peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 4000);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user?.id]);

  const sendTyping = useCallback((typing: boolean) => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: user.id, typing } });
  }, [user]);

  const notifyTyping = useCallback(() => {
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000);
  }, [sendTyping]);

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!conversationId || !user) throw new Error("Conversation not ready");
      const trimmed = content.trim();
      if (!trimmed) throw new Error("Message can't be empty");
      if (monthlyCount >= MONTHLY_LIMIT) throw new Error("Monthly chat limit reached.");
      const { error: sendError } = await supabase
        .from("chat_messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, content: trimmed });
      if (sendError) {
        if (sendError.message.includes("Monthly chat limit")) throw new Error("Monthly chat limit reached.");
        throw sendError;
      }
      sendTyping(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error: delError } = await supabase
        .from("chat_messages")
        .update({ deleted_at: new Date().toISOString(), content: "Message deleted" })
        .eq("id", messageId);
      if (delError) throw delError;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    conversationId,
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlderMessages,
    monthlyCount,
    monthlyLimit: MONTHLY_LIMIT,
    limitReached: monthlyCount >= MONTHLY_LIMIT,
    peerTyping,
    notifyTyping,
    sendMessage,
    deleteMessage,
    error,
  };
}
