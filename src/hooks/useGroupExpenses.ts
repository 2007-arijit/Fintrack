import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { GroupMember } from "@/hooks/useGroups";
import {
  LedgerExpenseRow, LedgerSplitRow, LedgerSettlementRow, LedgerSnapshot, AmountState,
  parseLedgerSnapshot, acceptSnapshot, deriveAmountState, ledgerFromSnapshot, friendlyMutationError,
} from "@/lib/ledgerState";
import { AllocationSnapshot, DivisionMode, CustomBasis, EngineParticipant, fromMinor, simplifyTransfers } from "@/lib/splitEngine";

export type GroupExpense = LedgerExpenseRow;
export type GroupExpenseSplit = LedgerSplitRow;
export type GroupSettlement = LedgerSettlementRow;

export const ledgerKey = (groupId: string | undefined) => ["group_ledger", groupId] as const;
export const auditKey = (groupId: string | undefined) => ["group_audit", groupId] as const;

export function toEngineParticipants(members: GroupMember[]): EngineParticipant[] {
  return members.map((m) => ({ id: m.id, mode: m.participation_mode ?? "solo", memberCount: m.member_count ?? 1 }));
}

export interface SaveExpenseInput {
  expenseId?: string;
  /** version the editor was opened on (optimistic concurrency) */
  expectedVersion?: number;
  description: string;
  amount: number;
  category: string;
  paidBy: string;
  divisionMode: DivisionMode;
  customBasis: CustomBasis | null;
  expenseDate: string;
  notes?: string;
  /** "participants" = only the payer and the members sharing it can see this expense */
  visibility: "group" | "participants";
  /** null on edit = "keep the stored allocation untouched" */
  snapshot: AllocationSnapshot | null;
}

/**
 * Realtime is only an INVALIDATION SIGNAL: every financial mutation writes an
 * audit event in the same DB transaction, so one filtered channel is enough. The
 * handler never merges payloads into state, so a duplicated or reordered event can
 * only trigger a refetch — it can never double-count.
 */
export function useGroupLedgerRealtime(groupId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string | undefined>();
    const flush = () => {
      pending.forEach((g) => {
        qc.invalidateQueries({ queryKey: ledgerKey(g) });
        qc.invalidateQueries({ queryKey: auditKey(g) });
        qc.invalidateQueries({ queryKey: ["transactions"] });
      });
      pending.clear();
    };
    const ch = supabase
      .channel(`group-audit-signal-${groupId ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_audit_events", ...(groupId ? { filter: `group_id=eq.${groupId}` } : {}) },
        (payload) => {
          pending.add((payload.new as { group_id?: string })?.group_id ?? groupId);
          clearTimeout(timer);
          timer = setTimeout(flush, 150); // coalesce bursts
        }
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [user, groupId, qc]);
}

export function useGroupExpenses(groupId: string | undefined, members: GroupMember[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ledgerKey(groupId);

  // ONE round-trip, ONE DB snapshot: expenses + splits + settlements + version are always
  // from the same committed generation. (Previously three queries, with the splits query
  // reading a stale `expensesQuery.data` closure, so a new expense could be paid-but-unallocated.)
  const query = useQuery({
    queryKey: key,
    enabled: !!user && !!groupId,
    // Financial data is never reused across mounts: gcTime 0 drops it as soon as nobody
    // observes it, so reopening a group (or switching groups) always starts from a skeleton.
    gcTime: 0,
    staleTime: 0,
    queryFn: async ({ signal }): Promise<LedgerSnapshot> => {
      const { data, error } = await supabase.rpc("get_group_ledger", { _group_id: groupId! }).abortSignal(signal);
      if (error) throw error;
      const incoming = parseLedgerSnapshot(data, groupId!);
      return acceptSnapshot(queryClient.getQueryData<LedgerSnapshot>(key), incoming);
    },
  });

  const pendingMutations = useIsMutating({ mutationKey: ["group_fin", groupId] });
  const isInvalidated = !!queryClient.getQueryState(key)?.isInvalidated;

  const amountState: AmountState = deriveAmountState({
    wantedGroupId: groupId,
    data: query.data,
    isError: query.isError,
    isFetching: query.isFetching,
    isInvalidated,
    pendingMutations,
  });
  const ready = amountState === "ready";

  const snapshot = query.data && query.data.group_id === groupId ? query.data : undefined;
  const currency = snapshot?.currency ?? "INR";

  const ledger = useMemo(() => {
    if (!snapshot) return undefined;
    const ids = [...new Set([...members.map((m) => m.id), ...snapshot.expenses.map((e) => e.paid_by)])];
    return ledgerFromSnapshot(snapshot, ids);
  }, [snapshot, members]);

  const balances = useMemo(() => {
    const out: Record<string, number> = {};
    if (ledger) for (const [id, b] of Object.entries(ledger.balances)) out[id] = fromMinor(b.netMinor, currency);
    return out;
  }, [ledger, currency]);

  const hiddenCount = snapshot?.hidden_count ?? 0;
  const youId = (members.find((m) => m.member_user_id === user?.id) ?? members.find((m) => m.is_you))?.id;

  const simplifiedTransfers = useMemo(() => {
    if (!ledger) return [];
    const net = Object.fromEntries(Object.entries(ledger.balances).map(([k, v]) => [k, v.netMinor]));
    const all = simplifyTransfers(net).map((t) => ({ fromMemberId: t.from, toMemberId: t.to, amount: fromMinor(t.amountMinor, currency) }));
    // When some expenses are hidden from this viewer, other people's balances are incomplete from
    // here, so only suggest payments that involve the viewer's own (fully visible) balance.
    return hiddenCount > 0 ? all.filter((t) => t.fromMemberId === youId || t.toMemberId === youId) : all;
  }, [ledger, currency, hiddenCount, youId]);

  // "You" is whichever member row is linked to the current account — falls back to
  // the legacy `is_you` flag for the group's original creator.
  const youMember = members.find((m) => m.member_user_id === user?.id) ?? members.find((m) => m.is_you);
  const yourNetBalance = ready && youMember && ledger ? fromMinor(ledger.balances[youMember.id]?.netMinor ?? 0, currency) : undefined;

  const settle = async () => {
    // Await the refetch so the mutation stays "pending" (skeletons) until the new
    // committed figures are in; only then are amounts shown again.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: auditKey(groupId) }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
  };
  const onError = (e: Error) => {
    toast.error(friendlyMutationError(e.message));
    // Failed write: drop anything we may have shown and reload the committed state.
    queryClient.invalidateQueries({ queryKey: key });
    if (e.message.startsWith("STALE_PARTICIPANTS")) queryClient.invalidateQueries({ queryKey: ["group_members"] });
  };

  const mutationKey = ["group_fin", groupId];

  const saveExpense = useMutation({
    mutationKey,
    mutationFn: async (i: SaveExpenseInput) => {
      const allocations = i.snapshot
        ? i.snapshot.allocations.map((a) => ({
            member_id: a.participantId,
            share_amount: fromMinor(a.shareMinor, currency),
            weight: a.weight,
            member_count: a.memberCountAtTime,
            mode: a.modeAtTime,
          }))
        : null;
      const { data, error } = await supabase.rpc("save_group_expense", {
        _expense_id: i.expenseId ?? null,
        _group_id: groupId!,
        _description: i.description,
        _amount: i.amount,
        _category: i.category,
        _paid_by: i.paidBy,
        _division_mode: i.divisionMode,
        _custom_basis: i.customBasis,
        _expense_date: i.expenseDate,
        _notes: i.notes ?? null,
        _allocations: allocations,
        _expected_version: i.expectedVersion ?? null,
        _visibility: i.visibility,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (_d, vars) => {
      await settle();
      toast.success(vars.expenseId ? "Expense updated" : "Expense added");
    },
    onError,
  });

  const deleteExpense = useMutation({
    mutationKey,
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { error } = await supabase.rpc("delete_group_expense", { _expense_id: id, _expected_version: version });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await settle();
      toast.success("Expense deleted — kept in Group Audit");
    },
    onError,
  });

  const restoreExpense = useMutation({
    mutationKey,
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("restore_group_expense", { _expense_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await settle();
      toast.success("Expense restored");
    },
    onError,
  });

  const settleUp = useMutation({
    mutationKey,
    mutationFn: async (i: {
      fromMemberId: string; toMemberId: string; amount: number; settledAt: string; note?: string;
    }) => {
      const { error } = await supabase.rpc("record_group_settlement", {
        _group_id: groupId!,
        _from: i.fromMemberId,
        _to: i.toMemberId,
        _amount: i.amount,
        _settled_at: i.settledAt,
        _note: i.note ?? null,
        _record_tx: false, // Split settlements never create personal transactions
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await settle();
      toast.success("Settlement recorded ✅");
    },
    onError,
  });

  const deleteSettlement = useMutation({
    mutationKey,
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_group_settlement", { _settlement_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await settle();
      toast.success("Settlement removed");
    },
    onError,
  });

  return {
    expenses: snapshot?.expenses ?? [],
    splits: snapshot?.splits ?? [],
    settlements: snapshot?.settlements ?? [],
    currency,
    version: snapshot?.version,
    /** expenses visible only to other participants (their effect on others is not shown to you) */
    hiddenCount,
    /** loading | ready | invalidated | error — every amount must honour this. */
    amountState,
    isLoading: amountState === "loading",
    isError: amountState === "error",
    error: query.error as Error | null,
    refetch: () => query.refetch(),
    ledger,
    balances,
    simplifiedTransfers,
    yourNetBalance,
    youMember,
    saveExpense,
    /** @deprecated kept for older callers */
    addExpense: saveExpense,
    deleteExpense,
    restoreExpense,
    settleUp,
    deleteSettlement,
  };
}
