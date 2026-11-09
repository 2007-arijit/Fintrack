/**
 * Pure helpers that decide whether a fetched financial snapshot may be shown.
 * Kept free of React / Supabase so the rules are unit-testable.
 */
import { toMinor, computeLedger, findUnreconciled, type LedgerExpense, type LedgerAllocation, type LedgerSettlement, type LedgerResult } from "./splitEngine";

export interface LedgerExpenseRow {
  id: string;
  group_id: string;
  user_id: string;
  description: string;
  amount: number;
  category: string;
  paid_by: string;
  division_mode: "per_person" | "per_family" | "custom" | "selected" | "personal";
  custom_basis: "amount" | "percentage" | "weight" | null;
  /** "participants": only the payer, creator and members with a share can see it (enforced by RLS). */
  visibility: "group" | "participants";
  split_type: string;
  expense_date: string;
  notes: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface LedgerSplitRow {
  id: string;
  expense_id: string;
  member_id: string;
  share_amount: number;
  share_units: number | null;
  weight: number | null;
  mode_at_time: "solo" | "family" | null;
  member_count_at_time: number | null;
}
export interface LedgerSettlementRow {
  id: string;
  group_id: string;
  user_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  settled_at: string;
  note: string | null;
  deleted_at: string | null;
}
export interface LedgerSnapshot {
  group_id: string;
  currency: string;
  /** groups.financial_version — monotonic per committed financial mutation. */
  version: number;
  /** Active expenses the caller is not allowed to see (visible only to other participants). */
  hidden_count: number;
  expenses: LedgerExpenseRow[];
  splits: LedgerSplitRow[];
  settlements: LedgerSettlementRow[];
}

export class LedgerAccessError extends Error {}

/** Validates the RPC payload and refuses anything that belongs to another group. */
export function parseLedgerSnapshot(raw: unknown, expectedGroupId: string): LedgerSnapshot {
  if (raw == null) throw new LedgerAccessError("You don't have access to this group's finances");
  const r = raw as Partial<LedgerSnapshot>;
  if (r.group_id !== expectedGroupId) throw new Error("Received financial data for a different group");
  if (typeof r.version !== "number" || !Array.isArray(r.expenses) || !Array.isArray(r.splits) || !Array.isArray(r.settlements)) {
    throw new Error("Malformed financial snapshot");
  }
  return { ...(r as LedgerSnapshot), hidden_count: typeof r.hidden_count === "number" ? r.hidden_count : 0 };
}

/**
 * Out-of-order protection: if a slower, older response resolves after a newer
 * one, keep the newer snapshot. Different groups never mix.
 */
export function acceptSnapshot(current: LedgerSnapshot | undefined, incoming: LedgerSnapshot): LedgerSnapshot {
  if (current && current.group_id === incoming.group_id && current.version > incoming.version) return current;
  return incoming;
}

export type AmountState = "loading" | "ready" | "invalidated" | "error";

export interface AmountStateInput {
  wantedGroupId: string | undefined;
  data: LedgerSnapshot | undefined;
  isError: boolean;
  isFetching: boolean;
  /** query was invalidated by a mutation / realtime and a refetch is pending */
  isInvalidated: boolean;
  pendingMutations: number;
}

/**
 * Loading | Ready | Invalidated | Failed. A previous value is only shown when it is
 * for the requested group, no mutation is in flight and it has not been invalidated.
 * (A plain background refetch of an un-invalidated, known-valid snapshot stays "ready".)
 */
export function deriveAmountState(i: AmountStateInput): AmountState {
  if (i.isError) return "error";
  if (!i.data || i.data.group_id !== i.wantedGroupId) return "loading";
  if (i.pendingMutations > 0) return "invalidated";
  if (i.isInvalidated && i.isFetching) return "invalidated";
  return "ready";
}

/** Snapshot → canonical engine inputs (integer minor units). */
export function ledgerFromSnapshot(snap: LedgerSnapshot, participantIds: string[]): LedgerResult & { unreconciled: string[] } {
  const c = snap.currency;
  const expenses: LedgerExpense[] = snap.expenses.map((e) => ({ id: e.id, paidBy: e.paid_by, amountMinor: toMinor(e.amount, c), deleted: !!e.deleted_at }));
  const allocations: LedgerAllocation[] = snap.splits.map((s) => ({ expenseId: s.expense_id, participantId: s.member_id, shareMinor: toMinor(s.share_amount, c) }));
  const settlements: LedgerSettlement[] = snap.settlements.map((s) => ({ id: s.id, from: s.from_member_id, to: s.to_member_id, amountMinor: toMinor(s.amount, c), deleted: !!s.deleted_at }));
  const res = computeLedger({ participantIds, expenses, allocations, settlements });
  return { ...res, unreconciled: findUnreconciled(expenses, allocations) };
}

export function friendlyMutationError(message: string): string {
  if (message.startsWith("CONFLICT")) return "Someone else changed this just now. The latest version has been loaded — review it and try again.";
  if (message.startsWith("STALE_PARTICIPANTS")) return "Participant details changed. The split was refreshed — please check it and save again.";
  return message;
}
