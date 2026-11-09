import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

async function invokeDestructiveAction(name: string, password: string) {
  if (!password.trim()) throw new Error("Please enter your current password.");
  const { data, error } = await supabase.functions.invoke(name, { body: { password } });
  if (error) {
    let message = error.message || "The request could not be completed.";
    const context = error.context as Response | undefined;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (typeof body?.error === "string") message = body.error;
      } catch {
        // Keep the SDK error when the response body is not JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}

/** Clears financial records while retaining the account and social profile. */
export function useDeleteFinancialData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => invokeDestructiveAction("delete-financial-data", password),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("All financial data deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Deletes the Auth identity; related application rows are removed by FK cascades. */
export function useDeleteAccount() {
  const { signOut } = useAuth();

  return useMutation({
    mutationFn: async (password: string) => {
      await invokeDestructiveAction("delete-account", password);
      await signOut();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
