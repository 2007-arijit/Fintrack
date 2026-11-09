import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptSnapshot, deriveAmountState, parseLedgerSnapshot, ledgerFromSnapshot, friendlyMutationError, type LedgerSnapshot } from "../ledgerState.ts";

const snap = (over: Partial<LedgerSnapshot> = {}): LedgerSnapshot => ({ group_id: "g1", currency: "INR", version: 1, hidden_count: 0, expenses: [], splits: [], settlements: [], ...over });
const exp = (id: string, amount: number, paid_by = "A", deleted_at: string | null = null) =>
  ({ id, group_id: "g1", user_id: "u", description: id, amount, category: "x", paid_by, division_mode: "per_family", custom_basis: null, visibility: "group", split_type: "per_family", expense_date: "2026-10-15", notes: null, version: 1, deleted_at, created_at: "", updated_at: "" }) as any;
const split = (expense_id: string, member_id: string, share_amount: number) => ({ id: expense_id + member_id, expense_id, member_id, share_amount, share_units: null, weight: 1, mode_at_time: "solo", member_count_at_time: 1 }) as any;
const base = { wantedGroupId: "g1", data: snap(), isError: false, isFetching: false, isInvalidated: false, pendingMutations: 0 } as const;

test("L1. switching groups never shows the previous group's amounts", () => {
  assert.equal(deriveAmountState({ ...base, wantedGroupId: "g2" }), "loading");
  assert.equal(deriveAmountState({ ...base, wantedGroupId: "g2", data: undefined }), "loading");
  assert.throws(() => parseLedgerSnapshot(snap({ group_id: "g1" }), "g2"));
});
test("L2/L3. pending mutation or invalidation never shows old amounts as ready", () => {
  assert.equal(deriveAmountState({ ...base, pendingMutations: 1 }), "invalidated");
  assert.equal(deriveAmountState({ ...base, isInvalidated: true, isFetching: true }), "invalidated");
  assert.equal(deriveAmountState(base), "ready");
  // plain background refetch of a valid snapshot stays ready (explicitly allowed)
  assert.equal(deriveAmountState({ ...base, isFetching: true }), "ready");
});
test("L4. older response cannot overwrite a newer committed snapshot", () => {
  const newer = snap({ version: 7 }), older = snap({ version: 5 });
  assert.equal(acceptSnapshot(newer, older), newer);
  assert.equal(acceptSnapshot(older, newer), newer);
  assert.equal(acceptSnapshot(snap({ group_id: "g1", version: 9 }), snap({ group_id: "g2", version: 1 })).group_id, "g2");
});
test("L5. duplicate delivery (query + realtime) never double-counts", () => {
  const s = snap({ expenses: [exp("e1", 100), exp("e1", 100)], splits: [split("e1", "A", 50), split("e1", "B", 50), split("e1", "B", 50)] });
  const l = ledgerFromSnapshot(s, ["A", "B"]);
  assert.equal(l.totalExpensesMinor, 10000);
  assert.equal(l.balances.B.shareMinor, 5000);
  assert.equal(l.imbalanceMinor, 0);
});
test("L6. failed fetch is an error state, not a stale value", () => {
  assert.equal(deriveAmountState({ ...base, isError: true }), "error");
  assert.equal(deriveAmountState({ ...base, isError: true, data: undefined }), "error");
});
test("L7/L8. mutation result: deleted expense leaves active totals", () => {
  const before = snap({ version: 1, expenses: [exp("e1", 100), exp("e2", 40)], splits: [split("e1", "A", 50), split("e1", "B", 50), split("e2", "A", 20), split("e2", "B", 20)] });
  const after = snap({ version: 2, expenses: [exp("e1", 100), exp("e2", 40, "A", "2026-10-15T10:35:00Z")], splits: before.splits });
  assert.equal(ledgerFromSnapshot(before, ["A", "B"]).totalExpensesMinor, 14000);
  const l = ledgerFromSnapshot(after, ["A", "B"]);
  assert.equal(l.totalExpensesMinor, 10000);
  assert.equal(l.balances.A.shareMinor, 5000); // deleted expense's allocation ignored
  assert.deepEqual(ledgerFromSnapshot(after, ["A", "B"]).unreconciled, []);
});
test("L9. skeleton persists until valid data is available", () => {
  assert.equal(deriveAmountState({ ...base, data: undefined, isFetching: true }), "loading");
});
test("L10. concurrency conflicts are surfaced, not swallowed", () => {
  assert.match(friendlyMutationError("CONFLICT: this expense was changed"), /Someone else changed/);
  assert.match(friendlyMutationError("STALE_PARTICIPANTS: x"), /Participant details changed/);
  assert.equal(friendlyMutationError("boom"), "boom");
});
test("malformed / no-access payloads are rejected", () => {
  assert.throws(() => parseLedgerSnapshot(null, "g1"), /access/);
  assert.throws(() => parseLedgerSnapshot({ group_id: "g1", version: 1 }, "g1"), /Malformed/);
});

test("hidden_count defaults to 0 and is preserved from the server", () => {
  const raw = { group_id: "g1", currency: "INR", version: 1, expenses: [], splits: [], settlements: [] };
  assert.equal(parseLedgerSnapshot(raw, "g1").hidden_count, 0);
  assert.equal(parseLedgerSnapshot({ ...raw, hidden_count: 2 }, "g1").hidden_count, 2);
});
