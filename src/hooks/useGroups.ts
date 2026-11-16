import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";
import { CurrencyCode } from "@/lib/formatCurrency";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export interface Group {
  id: string;
  user_id: string;
  name: string;
  group_type: "trip" | "home" | "couple" | "friends" | "other";
  currency: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  member_user_id: string | null;
  name: string;
  is_you: boolean;
  color: string | null;
  created_at: string;
  participation_mode: "solo" | "family";
  /** People represented. Always 1 for solo. */
  member_count: number;
  member_names: string[] | null;
}

export const GROUP_TYPES: { value: Group["group_type"]; label: string; emoji: string }[] = [
  { value: "trip", label: "Trip", emoji: "✈️" },
  { value: "home", label: "Home / Roommates", emoji: "🏠" },
  { value: "couple", label: "Couple", emoji: "💞" },
  { value: "friends", label: "Friends", emoji: "🎉" },
  { value: "other", label: "Other", emoji: "📁" },
];

const MEMBER_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7", "#ef4444", "#84cc16"];

export function useGroups() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { preferences } = useUserPreferences();
  // Real name to store for "your" own member row — never the literal
  // string "You", so the group looks correct from every member's account.
  // "You" is only ever a display-time label (see lib/memberDisplay.ts).
  const yourRealName = preferences?.display_name || user?.email?.split("@")[0] || "Me";

  const groupsQuery = useQuery({
    queryKey: ["groups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("groups").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Group[];
    },
    enabled: !!user,
  });

  const membersQuery = useQuery({
    queryKey: ["group_members", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data as GroupMember[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch1 = supabase
      .channel(`groups-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        queryClient.invalidateQueries({ queryKey: ["groups"] });
      })
      .subscribe();
    const ch2 = supabase
      .channel(`group-members-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        queryClient.invalidateQueries({ queryKey: ["group_members"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [user, queryClient]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    queryClient.invalidateQueries({ queryKey: ["group_members"] });
  };

  const createGroup = useMutation({
    mutationFn: async ({
      name,
      group_type,
      currency,
      friends,
    }: {
      name: string;
      group_type: Group["group_type"];
      currency: CurrencyCode;
      /** "You" is added automatically — these are friends invited from your friend list. */
      friends: { userId: string; name: string }[];
    }) => {
      const { data: group, error } = await supabase
        .from("groups")
        .insert({ name, group_type, currency, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;

      const rows = [
        { group_id: group.id, user_id: user!.id, member_user_id: user!.id, name: yourRealName, is_you: true, color: MEMBER_COLORS[0] },
        ...friends.map((f, i) => ({
          group_id: group.id,
          user_id: user!.id,
          member_user_id: f.userId,
          name: f.name,
          is_you: false,
          color: MEMBER_COLORS[(i + 1) % MEMBER_COLORS.length],
        })),
      ];

      const { error: memberErr } = await supabase.from("group_members").insert(rows);
      if (memberErr) throw memberErr;

      return group as Group;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Group created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMember = useMutation({
    mutationFn: async ({ groupId, userId, name }: { groupId: string; userId: string; name: string }) => {
      const existingCount = (membersQuery.data ?? []).filter((m) => m.group_id === groupId).length;
      const { error } = await supabase.from("group_members").insert({
        group_id: groupId,
        user_id: user!.id,
        member_user_id: userId,
        name,
        is_you: false,
        color: MEMBER_COLORS[existingCount % MEMBER_COLORS.length],
      });
      if (error) {
        if (error.code === "23505") throw new Error("That friend is already in this group.");
        throw error;
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Member added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("group_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Member removed");
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("foreign key")
          ? "Can't remove a member who's part of an expense or settlement"
          : e.message
      ),
  });

  const updateParticipant = useMutation({
    mutationFn: async (v: { memberId: string; name: string; mode: "solo" | "family"; memberCount: number; memberNames: string[] }) => {
      const { error } = await supabase.rpc("update_group_participant", {
        _member_id: v.memberId,
        _name: v.name,
        _mode: v.mode,
        _member_count: v.memberCount,
        _member_names: v.memberNames.length ? v.memberNames : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidateAll();
      // Historical allocations keep their own snapshot; only the audit trail changes.
      queryClient.invalidateQueries({ queryKey: ["group_audit"] });
      toast.success("Participant updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setGroupArchived = useMutation({
    mutationFn: async ({ groupId, archived }: { groupId: string; archived: boolean }) => {
      const { data, error } = await supabase
        .from("groups")
        .update({ archived })
        .eq("id", groupId)
        .eq("user_id", user!.id)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateAll();
      toast.success(variables.archived ? "Group archived. Its history is preserved." : "Group restored.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    groups: groupsQuery.data ?? [],
    members: membersQuery.data ?? [],
    isLoading: groupsQuery.isLoading || membersQuery.isLoading,
    createGroup,
    addMember,
    removeMember,
    updateParticipant,
    setGroupArchived,
  };
}
