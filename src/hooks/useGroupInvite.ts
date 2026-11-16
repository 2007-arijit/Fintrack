import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface GroupInvite {
  id: string;
  group_id: string;
  code: string;
  created_by: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useGroupInvite(groupId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const inviteQuery = useQuery({
    queryKey: ["group_invite", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_invites")
        .select("*")
        .eq("group_id", groupId!)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as GroupInvite | null;
    },
    enabled: !!user && !!groupId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["group_invite", groupId] });

  const createInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("group_invites")
        .insert({ group_id: groupId!, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as GroupInvite;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Invite link created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("group_invites").update({ active: false }).eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Invite link revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    invite: inviteQuery.data ?? null,
    isLoading: inviteQuery.isLoading,
    createInvite,
    revokeInvite,
  };
}

export function inviteUrl(code: string) {
  return `${window.location.origin}/invite/${code}`;
}

export function useJoinGroup() {
  const queryClient = useQueryClient();

  const joinGroup = useMutation({
    mutationFn: async ({ code, mode, memberCount, memberNames }: { code: string; mode: "solo" | "family"; memberCount: number; memberNames?: string[] }) => {
      const { data, error } = await supabase.rpc("join_group_via_invite", {
        _code: code,
        _mode: mode,
        _member_count: mode === "solo" ? 1 : memberCount,
        _member_names: memberNames && memberNames.length ? memberNames : null,
      });
      if (error) throw error;
      return data as string; // group_id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["group_members"] });
    },
  });

  return { joinGroup };
}
