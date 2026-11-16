import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  created_at: string;
  last_seen_at: string | null;
  blocked_until: string | null;
  is_developer: boolean;
  chat_messages_sent: number;
  chat_rate_per_day: number;
}

/** Total registered users across the whole app (developer-only). */
export function useAdminUserStats() {
  return useQuery({
    queryKey: ["admin_user_stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_user_stats");
      if (error) throw error;
      return data?.[0] ?? { total_users: 0 };
    },
  });
}

/** Full user list with presence + chat-rate stats (developer-only). */
export function useAdminUserList() {
  return useQuery({
    queryKey: ["admin_user_list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_user_list");
      if (error) throw error;
      return (data ?? []) as AdminUserRow[];
    },
  });
}

export function useAdminBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, hours }: { userId: string; hours: number }) => {
      const { error } = await supabase.rpc("admin_block_user", { _user_id: userId, _hours: hours });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_user_list"] });
      toast.success("User blocked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_unblock_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_user_list"] });
      toast.success("User unblocked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
