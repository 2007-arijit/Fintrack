import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface Friend {
  friend_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface FriendRequestProfile {
  request_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export function useFriends() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const friendsQuery = useQuery({
    queryKey: ["friends", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_friends");
      if (error) throw error;
      return data as Friend[];
    },
    enabled: !!user,
  });

  const incomingQuery = useQuery({
    queryKey: ["friend_requests_incoming", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_incoming_requests");
      if (error) throw error;
      return data as FriendRequestProfile[];
    },
    enabled: !!user,
  });

  const outgoingQuery = useQuery({
    queryKey: ["friend_requests_outgoing", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_outgoing_requests");
      if (error) throw error;
      return data as FriendRequestProfile[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`friend-requests-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["friends"] });
        queryClient.invalidateQueries({ queryKey: ["friend_requests_incoming"] });
        queryClient.invalidateQueries({ queryKey: ["friend_requests_outgoing"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, queryClient]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    queryClient.invalidateQueries({ queryKey: ["friend_requests_incoming"] });
    queryClient.invalidateQueries({ queryKey: ["friend_requests_outgoing"] });
  };

  const sendRequest = useMutation({
    mutationFn: async (receiverId: string) => {
      const { error } = await supabase.from("friend_requests").insert({ sender_id: user!.id, receiver_id: receiverId });
      if (error) {
        if (error.code === "23505") throw new Error("You've already sent (or have) a request with this user.");
        throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Friend request sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respondRequest = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidateAll();
      toast.success(vars.accept ? "Friend added" : "Request declined");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelOrRemove = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from("friend_requests").delete().eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFriend = useMutation({
    mutationFn: async (friendId: string) => {
      const { error } = await supabase.rpc("remove_friend", { _friend_id: friendId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Friend removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    friends: friendsQuery.data ?? [],
    incoming: incomingQuery.data ?? [],
    outgoing: outgoingQuery.data ?? [],
    isLoading: friendsQuery.isLoading,
    sendRequest,
    respondRequest,
    cancelOrRemove,
    removeFriend,
  };
}

export function useUserSearch() {
  const [query, setQuery] = useState("");
  const searchQuery = useQuery({
    queryKey: ["search_users", query],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_users", { _query: query.toLowerCase().trim() });
      if (error) throw error;
      return data as {
        user_id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }[];
    },
    enabled: query.trim().length >= 2,
  });

  return { query, setQuery, results: searchQuery.data ?? [], isLoading: searchQuery.isFetching };
}
