import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";

export interface Transaction {
  id: string;
  user_id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  custom_category?: string | null;
  description?: string | null;
  date: string;
  payment_method?: string | null;
  source?: string | null;
  debt_id?: string | null;
  import_hash?: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionInsert = Omit<Transaction, "id" | "created_at" | "updated_at">;

export function useTransactions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`transactions-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const addTransaction = useMutation({
    mutationFn: async (tx: Omit<TransactionInsert, "user_id">) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Transaction> & { id: string }) => {
      const { data, error } = await supabase.from("transactions").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("transactions").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transactions deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    bulkDelete,
  };
}
