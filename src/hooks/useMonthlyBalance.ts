import { useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subMonths, endOfMonth, parseISO } from "date-fns";

export function useMonthlyBalance(transactions: { type: string; amount: number; date: string }[]) {
  const { user } = useAuth();
  const now = new Date();
  const prevMonthKey = format(subMonths(now, 1), "yyyy-MM");
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  // Always derive the carried-forward balance from the real transaction data
  // (income minus expenses for every transaction up through the end of last
  // month). This is recomputed whenever transactions change, so it can never
  // go stale the way a one-time cached snapshot could.
  const carryForward = useMemo(() => {
    const upToPrevMonth = transactions.filter((t) => parseISO(t.date) <= prevMonthEnd);
    if (upToPrevMonth.length === 0) return 0;

    const totalIncome = upToPrevMonth
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalExpense = upToPrevMonth
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);

    return totalIncome - totalExpense;
  }, [transactions, prevMonthEnd]);

  // Keep the monthly_balances table in sync in the background (best-effort,
  // doesn't gate what's shown on screen). Skips redundant writes.
  const lastWritten = useRef<number | null>(null);
  useEffect(() => {
    if (!user || transactions.length === 0) return;
    if (lastWritten.current === carryForward) return;

    supabase
      .from("monthly_balances")
      .upsert(
        { user_id: user.id, month: prevMonthKey, closing_balance: carryForward },
        { onConflict: "user_id,month" }
      )
      .then(({ error }) => {
        if (!error) lastWritten.current = carryForward;
      });
  }, [user, prevMonthKey, carryForward, transactions.length]);

  return { carryForward, isLoading: false };
}
