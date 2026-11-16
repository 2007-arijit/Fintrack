import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { validateUpiId } from "@/lib/upi";

export interface UserPreferences {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  username_updated_at: string | null;
  previous_username: string | null;
  avatar_url: string | null;
  currency: string;
  monthly_budget_default: number;
  upi_id: string | null;
  is_developer: boolean;
  blocked_until: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const USERNAME_COOLDOWN_DAYS = 14;

export function isValidUsername(u: string) {
  return USERNAME_RE.test(u);
}

/** Days remaining before the username can be changed again (0 = editable now). */
export function usernameCooldownDaysLeft(usernameUpdatedAt: string | null | undefined): number {
  if (!usernameUpdatedAt) return 0;
  const changedAt = new Date(usernameUpdatedAt).getTime();
  const msSince = Date.now() - changedAt;
  const daysSince = msSince / (1000 * 60 * 60 * 24);
  const daysLeft = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSince);
  return daysLeft > 0 ? daysLeft : 0;
}

export function useUserPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user_preferences", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as UserPreferences;
    },
    enabled: !!user,
  });

  const updatePreferences = useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<
          UserPreferences,
          "display_name" | "currency" | "monthly_budget_default" | "username" | "avatar_url" | "previous_username" | "username_updated_at" | "upi_id"
        >
      >
    ) => {
      if (updates.username !== undefined && updates.username !== null && !isValidUsername(updates.username)) {
        throw new Error("Username must be 3-20 characters: lowercase letters, numbers, and underscores only.");
      }
      if (updates.upi_id !== undefined && updates.upi_id !== null && updates.upi_id !== "" && !validateUpiId(updates.upi_id)) {
        throw new Error("That doesn't look like a valid UPI ID (e.g. yourname@okhdfcbank).");
      }
      const { data, error } = await supabase
        .from("user_preferences")
        .update(updates)
        .eq("user_id", user!.id)
        .select()
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("That username is already taken.");
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_preferences"] });
      toast.success("Preferences updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Change the username, respecting the 14-day cooldown, and remember the old one. */
  const changeUsername = (newUsername: string) => {
    const current = query.data;
    const u = newUsername.trim().toLowerCase();
    if (!isValidUsername(u)) {
      toast.error("Username must be 3-20 characters: lowercase letters, numbers, and underscores only.");
      return;
    }
    if (current?.username === u) return;
    const daysLeft = usernameCooldownDaysLeft(current?.username_updated_at);
    if (daysLeft > 0) {
      toast.error(`You can change your username again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
      return;
    }
    updatePreferences.mutate({
      username: u,
      previous_username: current?.username ?? null,
      username_updated_at: new Date().toISOString(),
    });
  };

  /** Revert to the immediately-previous username. Exempt from the cooldown,
   *  but can only be used once per change (consumes previous_username). */
  const revertUsername = () => {
    const current = query.data;
    if (!current?.previous_username) return;
    updatePreferences.mutate({
      username: current.previous_username,
      previous_username: null,
      username_updated_at: new Date().toISOString(),
    });
  };

  return { preferences: query.data, isLoading: query.isLoading, updatePreferences, changeUsername, revertUsername };
}
