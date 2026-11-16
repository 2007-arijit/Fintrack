import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Budget {
  id: string;
  user_id: string;
  category: string;
  amount: number;
  month: number;
  year: number;
  created_at: string;
  updated_at: string;
}

export function useBudgets(month?: number, year?: number) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();

  const query = useQuery({
    queryKey: ["budgets", user?.id, m, y],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("month", m)
        .eq("year", y);
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!user,
  });

  const upsertBudget = useMutation({
    mutationFn: async (budget: { category: string; amount: number; month: number; year: number }) => {
      const { data, error } = await supabase
        .from("budgets")
        .upsert({ ...budget, user_id: user!.id }, { onConflict: "user_id,category,month,year" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBudget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { budgets: query.data ?? [], isLoading: query.isLoading, upsertBudget, deleteBudget };
}
