import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Verifies the given password against Supabase Auth for the current user,
 * then permanently deletes ALL financial data (transactions, budgets,
 * debts, etc.) while keeping the account, profile, friends, and chat
 * history intact. Used by the "Delete All Data" button in Settings.
 */
export function useDeleteFinancialData() {
  const { user, signOut } = useAuth();

  return useMutation({
    mutationFn: async (password: string) => {
      if (!user?.email) throw new Error("No authenticated user");
      if (!password) throw new Error("Please enter your current password");

      // Re-authenticate to prove the caller actually knows the password —
      // Supabase has no standalone "verify password" call, so we do a
      // real sign-in attempt against the current session's email.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) throw new Error("Incorrect password. Data was not deleted.");

      const { error } = await supabase.rpc("delete_my_financial_data");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All financial data deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Permanently and irreversibly deletes the account: every owned row across
 * every table, then the Supabase Auth user itself, via the `delete-account`
 * Edge Function (which alone holds the service-role key needed to remove
 * an auth user). Signs the user out and the caller should redirect to /auth.
 */
export function useDeleteAccount() {
  const { signOut } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (error) throw new Error(error.message || "Account deletion failed");
      if (data?.error) throw new Error(data.error);
      await signOut();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
