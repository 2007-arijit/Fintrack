/**
 * FinTrack split engine — the ONLY place allocation and balance math lives.
 *
 * All arithmetic is done on integer minor units (paise/cents). Floats are
 * only used at the I/O edge (toMinor / fromMinor).
 *
 * Rounding policy (documented, deterministic):
 *   Largest-remainder method. Every share is floored to a whole minor unit,
 *   then the leftover units are handed out one each to the shares with the
 *   largest fractional remainder; ties are broken by the input order of the
 *   participants (stable). The allocations therefore always sum EXACTLY to
 *   the transaction amount, and the same inputs always give the same output.
 *
 * Accounting semantics (never interchangeable):
 *   expense amount  – total of one transaction
 *   paid            – sum of active expenses a participant paid
 *   share           – sum of allocations charged to a participant
 *   settledOut/In   – settlements the participant paid / received
 *   net             = paid − share + settledOut − settledIn
 *                     (> 0: group owes them; < 0: they owe the group)
 *   Σ net over all participants is always exactly 0.
 */

export type DivisionMode = "per_person" | "per_family" | "custom" | "selected" | "personal";
export type CustomBasis = "amount" | "percentage" | "weight";
export type ParticipationMode = "solo" | "family";

export const DIVISION_MODE_HELP: Record<DivisionMode, string> = {
  per_person: "Split according to the number of people represented.",
  per_family: "Split equally among participating accounts.",
  custom: "Define exact amounts, percentages, or share weights.",
  selected: "Only selected participants or members share this expense.",
  personal: "This expense belongs entirely to the responsible participant.",
};

export const DIVISION_MODE_LABEL: Record<DivisionMode, string> = {
  per_person: "Per Person",
  per_family: "Per Family",
  custom: "Custom",
  selected: "Selected",
  personal: "Personal",
};

export class SplitError extends Error {}

// ─── money conversion (edge only) ────────────────────────────
export function minorDigits(currency: string): number {
  return ["JPY", "KRW", "CLP", "HUF"].includes(currency) ? 0 : 2;
}
export function toMinor(amount: number | string, currency = "INR"): number {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) throw new SplitError("Amount is not a valid number");
  return Math.round(n * 10 ** minorDigits(currency) + (n < 0 ? -1e-9 : 1e-9));
}
export function fromMinor(minor: number, currency = "INR"): number {
  return minor / 10 ** minorDigits(currency);
}

// ─── participants ────────────────────────────────────────────
export interface EngineParticipant {
  id: string;
  mode: ParticipationMode;
  /** People represented. Solo is always 1. */
  memberCount: number;
}

/** Weight of a participant under Per Person. Solo is always 1. */
export function personWeight(p: EngineParticipant): number {
  return p.mode === "solo" ? 1 : p.memberCount;
}

export function validateParticipant(p: { mode: ParticipationMode; memberCount: number }): string | null {
  if (!Number.isInteger(p.memberCount) || p.memberCount < 1) return "Member count must be a whole number of at least 1";
  if (p.mode === "solo" && p.memberCount !== 1) return "A solo participant represents exactly one person";
  if (p.mode === "family" && p.memberCount < 2) return "A family represents at least two people";
  return null;
}

// ─── core allocator ──────────────────────────────────────────
/**
 * Distribute `totalMinor` across `weights` (non-negative integers or
 * finite non-negative numbers) using largest-remainder rounding.
 */
export function allocateByWeights(totalMinor: number, weights: number[]): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) throw new SplitError("Total must be a non-negative integer of minor units");
  if (weights.length === 0) throw new SplitError("Select at least one participant");
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new SplitError("Weights must be non-negative numbers");
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW <= 0) throw new SplitError("Total weight must be greater than zero");

  // Scale weights to integers to keep the remainder comparison exact for
  // decimal weights such as 33.33 (percentages).
  const SCALE = 1_000_000;
  const iw = weights.map((w) => Math.round(w * SCALE));
  const isum = iw.reduce((s, w) => s + w, 0);
  if (isum <= 0) throw new SplitError("Total weight must be greater than zero");

  const base: number[] = [];
  const rem: number[] = [];
  let assigned = 0;
  for (const w of iw) {
    // BigInt avoids overflow of total * w for large totals.
    const prod = BigInt(totalMinor) * BigInt(w);
    const q = Number(prod / BigInt(isum));
    const r = Number(prod % BigInt(isum));
    base.push(q);
    rem.push(r);
    assigned += q;
  }
  let left = totalMinor - assigned;
  const order = rem
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => iw[i] > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) base[order[k].i] += 1;
  return base;
}

// ─── allocation ──────────────────────────────────────────────
export interface AllocationInput {
  mode: DivisionMode;
  totalMinor: number;
  /** All active participants of the group (used to read weights). */
  participants: EngineParticipant[];
  /** Ids sharing the expense (per_person / per_family / selected / custom). */
  eligibleIds?: string[];
  /** Personal mode: the responsible participant. */
  responsibleId?: string;
  customBasis?: CustomBasis;
  /** Custom values keyed by participant id: minor units | percent | weight. */
  customValues?: Record<string, number>;
}

export interface Allocation {
  participantId: string;
  shareMinor: number;
  /** Basis that produced the share, so history is reproducible. */
  weight: number | null;
  memberCountAtTime: number;
  modeAtTime: ParticipationMode;
}

export interface AllocationSnapshot {
  version: 1;
  divisionMode: DivisionMode;
  customBasis: CustomBasis | null;
  totalMinor: number;
  allocations: Allocation[];
}

export function computeAllocation(input: AllocationInput): AllocationSnapshot {
  const { mode, totalMinor, participants } = input;
  if (!Number.isInteger(totalMinor) || totalMinor <= 0) throw new SplitError("Amount must be greater than zero");
  const byId = new Map(participants.map((p) => [p.id, p]));
  const need = (id: string) => {
    const p = byId.get(id);
    if (!p) throw new SplitError("Unknown participant in split");
    return p;
  };

  let ids: string[];
  let weights: number[];
  let customBasis: CustomBasis | null = null;
  let shares: number[];

  if (mode === "personal") {
    if (!input.responsibleId) throw new SplitError("Choose the responsible participant");
    ids = [need(input.responsibleId).id];
    weights = [1];
    shares = [totalMinor];
  } else {
    ids = [...new Set(input.eligibleIds ?? [])];
    if (ids.length === 0) throw new SplitError("Select at least one participant");
    const ps = ids.map(need);
    if (mode === "per_person") {
      weights = ps.map(personWeight);
      shares = allocateByWeights(totalMinor, weights);
    } else if (mode === "per_family" || mode === "selected") {
      weights = ps.map(() => 1);
      shares = allocateByWeights(totalMinor, weights);
    } else if (mode === "custom") {
      customBasis = input.customBasis ?? "weight";
      const vals = ids.map((id) => input.customValues?.[id] ?? 0);
      if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new SplitError("Custom values cannot be negative");
      weights = vals;
      if (customBasis === "amount") {
        if (vals.some((v) => !Number.isInteger(v))) throw new SplitError("Exact amounts must be whole minor units");
        const sum = vals.reduce((s, v) => s + v, 0);
        if (sum !== totalMinor) throw new SplitError("Exact amounts must add up to the expense amount");
        shares = [...vals];
      } else if (customBasis === "percentage") {
        const sum = Math.round(vals.reduce((s, v) => s + v, 0) * 1e6);
        if (sum !== 100 * 1e6) throw new SplitError("Percentages must add up to 100%");
        shares = allocateByWeights(totalMinor, vals);
      } else {
        if (vals.reduce((s, v) => s + v, 0) <= 0) throw new SplitError("Enter at least one share weight");
        shares = allocateByWeights(totalMinor, vals);
      }
    } else {
      throw new SplitError(`Unknown division mode: ${mode}`);
    }
  }

  const allocations: Allocation[] = ids.map((id, i) => {
    const p = byId.get(id)!;
    return { participantId: id, shareMinor: shares[i], weight: weights[i], memberCountAtTime: p.memberCount, modeAtTime: p.mode };
  });
  const check = allocations.reduce((s, a) => s + a.shareMinor, 0);
  if (check !== totalMinor) throw new SplitError("Internal error: allocations do not reconcile"); // invariant 1
  return { version: 1, divisionMode: mode, customBasis, totalMinor, allocations };
}

// ─── balances ────────────────────────────────────────────────
export interface LedgerExpense {
  id: string;
  paidBy: string;
  amountMinor: number;
  deleted?: boolean;
}
export interface LedgerAllocation {
  expenseId: string;
  participantId: string;
  shareMinor: number;
}
export interface LedgerSettlement {
  id: string;
  from: string;
  to: string;
  amountMinor: number;
  deleted?: boolean;
}
export interface ParticipantBalance {
  paidMinor: number;
  shareMinor: number;
  settledOutMinor: number;
  settledInMinor: number;
  /** paid − share + settledOut − settledIn */
  netMinor: number;
}
export interface LedgerResult {
  totalExpensesMinor: number;
  balances: Record<string, ParticipantBalance>;
  /** Σ net — must be 0. */
  imbalanceMinor: number;
}

/**
 * The one canonical ledger computation. Dedupes by id (a record delivered
 * twice by a query + realtime event is counted once) and ignores deleted
 * records. Allocations whose expense is inactive/unknown are ignored.
 */
export function computeLedger(args: {
  participantIds: string[];
  expenses: LedgerExpense[];
  allocations: LedgerAllocation[];
  settlements: LedgerSettlement[];
}): LedgerResult {
  const bal: Record<string, ParticipantBalance> = {};
  const row = (id: string) =>
    (bal[id] ??= { paidMinor: 0, shareMinor: 0, settledOutMinor: 0, settledInMinor: 0, netMinor: 0 });
  args.participantIds.forEach(row);

  const active = new Map<string, LedgerExpense>();
  for (const e of args.expenses) if (!e.deleted) active.set(e.id, e);
  let total = 0;
  for (const e of active.values()) {
    row(e.paidBy).paidMinor += e.amountMinor;
    total += e.amountMinor;
  }
  const seenAlloc = new Set<string>();
  for (const a of args.allocations) {
    if (!active.has(a.expenseId)) continue;
    const key = `${a.expenseId}:${a.participantId}`;
    if (seenAlloc.has(key)) continue;
    seenAlloc.add(key);
    row(a.participantId).shareMinor += a.shareMinor;
  }
  const seenSettle = new Set<string>();
  for (const s of args.settlements) {
    if (s.deleted || seenSettle.has(s.id)) continue;
    seenSettle.add(s.id);
    row(s.from).settledOutMinor += s.amountMinor;
    row(s.to).settledInMinor += s.amountMinor;
  }
  let imbalance = 0;
  for (const b of Object.values(bal)) {
    b.netMinor = b.paidMinor - b.shareMinor + b.settledOutMinor - b.settledInMinor;
    imbalance += b.netMinor;
  }
  return { totalExpensesMinor: total, balances: bal, imbalanceMinor: imbalance };
}

/** Allocation-vs-expense reconciliation per active expense (invariant 1). */
export function findUnreconciled(expenses: LedgerExpense[], allocations: LedgerAllocation[]): string[] {
  const sums = new Map<string, number>();
  for (const a of allocations) sums.set(a.expenseId, (sums.get(a.expenseId) ?? 0) + a.shareMinor);
  return expenses.filter((e) => !e.deleted && (sums.get(e.id) ?? 0) !== e.amountMinor).map((e) => e.id);
}

export interface Transfer {
  from: string;
  to: string;
  amountMinor: number;
}

/** Greedy minimum-transfer settlement plan from net balances (integers). */
export function simplifyTransfers(netByParticipant: Record<string, number>): Transfer[] {
  const cr = Object.entries(netByParticipant).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const db = Object.entries(netByParticipant).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  cr.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  db.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const amt = Math.min(db[i].v, cr[j].v);
    if (amt > 0) out.push({ from: db[i].id, to: cr[j].id, amountMinor: amt });
    db[i].v -= amt;
    cr[j].v -= amt;
    if (db[i].v === 0) i++;
    if (cr[j].v === 0) j++;
  }
  return out;
}

/** Remaining outstanding between two parties never goes below zero. */
export function remainingAfterSettlement(owedMinor: number, settledMinor: number): number {
  return Math.max(0, owedMinor - settledMinor);
}
