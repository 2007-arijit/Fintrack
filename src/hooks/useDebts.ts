import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";

export interface Debt {
  id: string;
  user_id: string;
  type: "receivable" | "payable";
  person_name: string;
  original_amount: number;
  remaining_amount: number;
  description: string | null;
  debt_date: string;
  due_date: string | null;
  status: "active" | "settled";
  created_at: string;
  updated_at: string;
}

export interface DebtSettlement {
  id: string;
  debt_id: string;
  user_id: string;
  amount_settled: number;
  settled_at: string;
  note: string | null;
  created_at: string;
}

export function useDebts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const debtsQuery = useQuery({
    queryKey: ["debts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("debts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Debt[];
    },
    enabled: !!user,
  });

  const settlementsQuery = useQuery({
    queryKey: ["debt_settlements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_settlements")
        .select("*")
        .order("settled_at", { ascending: false });
      if (error) throw error;
      return data as DebtSettlement[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch1 = supabase
      .channel(`debts-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "debts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["debts"] });
      })
      .subscribe();
    const ch2 = supabase
      .channel(`settlements-realtime-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "debt_settlements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["debt_settlements"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [user, queryClient]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["debts"] });
    queryClient.invalidateQueries({ queryKey: ["debt_settlements"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const addDebt = useMutation({
    mutationFn: async (debt: Omit<Debt, "id" | "user_id" | "created_at" | "updated_at">) => {
      const { data: newDebt, error } = await supabase
        .from("debts")
        .insert({
          type: debt.type,
          person_name: debt.person_name,
          original_amount: debt.original_amount,
          remaining_amount: debt.remaining_amount,
          description: debt.description ?? null,
          debt_date: debt.debt_date,
          due_date: debt.due_date ?? null,
          status: debt.status,
          user_id: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      const isReceivable = debt.type === "receivable";
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        type: isReceivable ? "expense" : "income",
        amount: debt.original_amount,
        category: isReceivable ? "debt_money_lent" : "debt_money_borrowed",
        description: isReceivable
          ? `Lent to ${debt.person_name}${debt.description ? " — " + debt.description : ""}`
          : `Borrowed from ${debt.person_name}${debt.description ? " — " + debt.description : ""}`,
        date: debt.debt_date,
        payment_method: "cash",
        source: "debt_auto",
        debt_id: newDebt.id,
      });
      if (txErr) throw txErr;

      return newDebt;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Debt added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settleDebt = useMutation({
    mutationFn: async ({
      debt,
      amountSettled,
      settledAt,
      note,
      markFullySettled,
    }: {
      debt: Debt;
      amountSettled: number;
      settledAt: string;
      note?: string;
      markFullySettled?: boolean;
    }) => {
      const { error: settleErr } = await supabase.from("debt_settlements").insert({
        debt_id: debt.id,
        user_id: user!.id,
        amount_settled: amountSettled,
        settled_at: settledAt,
        note: note || null,
      });
      if (settleErr) throw settleErr;

      const isFullSettle = markFullySettled || amountSettled >= debt.remaining_amount;
      const newRemaining = isFullSettle ? 0 : debt.remaining_amount - amountSettled;
      const newStatus = isFullSettle ? "settled" : "active";

      const { error: updateErr } = await supabase
        .from("debts")
        .update({ remaining_amount: newRemaining, status: newStatus })
        .eq("id", debt.id);
      if (updateErr) throw updateErr;

      const isReceivable = debt.type === "receivable";
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: user!.id,
        type: isReceivable ? "income" : "expense",
        amount: amountSettled,
        category: isReceivable ? "debt_recovery_received" : "debt_payment_paid_back",
        description: isReceivable
          ? `Received from ${debt.person_name}${note ? " — " + note : ""}`
          : `Paid to ${debt.person_name}${note ? " — " + note : ""}`,
        date: settledAt,
        payment_method: "cash",
        source: "debt_auto",
        debt_id: debt.id,
      });
      if (txErr) throw txErr;

      if (isFullSettle) {
        toast.success("Debt fully settled ✅");
      } else {
        toast.success(`Partial settlement saved. ${newRemaining} still ${isReceivable ? "receivable" : "payable"}.`);
      }
    },
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDebt = useMutation({
    mutationFn: async (id: string) => {
      const { error: txErr } = await supabase
        .from("transactions")
        .delete()
        .eq("debt_id", id)
        .eq("source", "debt_auto");
      if (txErr) throw txErr;

      const { error: sErr } = await supabase.from("debt_settlements").delete().eq("debt_id", id);
      if (sErr) throw sErr;

      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Debt deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const debts = debtsQuery.data ?? [];
  const totalReceivable = debts
    .filter((d) => d.type === "receivable" && d.status === "active")
    .reduce((s, d) => s + Number(d.remaining_amount), 0);
  const totalPayable = debts
    .filter((d) => d.type === "payable" && d.status === "active")
    .reduce((s, d) => s + Number(d.remaining_amount), 0);

  return {
    debts,
    settlements: settlementsQuery.data ?? [],
    isLoading: debtsQuery.isLoading,
    totalReceivable,
    totalPayable,
    addDebt,
    settleDebt,
    deleteDebt,
  };
}
